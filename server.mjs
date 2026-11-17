import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import locations from './public/locations.js';
import { parseRequest } from './public/assistant.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(root, 'public');
const dbPath = process.env.DATABASE_PATH || resolve(root, 'data', 'salgy.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, salt TEXT NOT NULL, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS records (user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,kind,id));
  CREATE TABLE IF NOT EXISTS agents (user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id), recipient_id TEXT NOT NULL REFERENCES users(id), listing_id TEXT NOT NULL REFERENCES listings(id), data TEXT NOT NULL, created INTEGER NOT NULL);
`);
const sql = (query, ...args) => db.prepare(query).run(...args);
const one = (query, ...args) => db.prepare(query).get(...args);
const rows = (query, ...args) => db.prepare(query).all(...args);
const hashToken = token => createHash('sha256').update(token).digest('hex');
const ttl = 7 * 24 * 60 * 60 * 1000;
const rate = new Map();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, 'Maglumatlary dogry dolduryň.');
  return value.trim();
};
const number = (value, min, max, integer = false) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && !value.trim())) fail(400, 'San bahasyny dogry giriziň.');
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) fail(400, 'San bahasyny dogry giriziň.');
  return result;
};
function place(data) {
  if (!Object.hasOwn(locations, data.region) || !locations[data.region].includes(data.district)) fail(400, 'Ýerleşýän ýeri saýlaň.');
  return { region: data.region, district: data.district };
}
const modes = ['buy', 'rent', 'commercial'];
const types = ['apartment', 'house', 'room', 'land', 'office', 'retail', 'warehouse', 'investment'];
const features = ['balcony', 'parking', 'furnished', 'elevator', 'terrace', 'short'];
function listingData(data, previous) {
  if (!modes.includes(data.mode) || !types.includes(data.type)) fail(400, 'Emlägiň görnüşini saýlaň.');
  if (!Array.isArray(data.features) || data.features.some(item => !features.includes(item))) fail(400, 'Aýratynlyklary dogry saýlaň.');
  if (!Array.isArray(data.photos) || data.photos.length > 3) fail(400, 'Iň köp üç surat saýlaň.');
  const photos = data.photos.map(photo => {
    if (typeof photo !== 'string' || photo.length > 530000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) fail(400, 'JPEG surat ulanyň.');
    const bytes = Buffer.from(photo.split(',')[1], 'base64');
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) fail(400, 'Suraty okap bolmady.');
    return photo;
  });
  const combined = [...(previous && !data.removePhotos ? previous.photos : []), ...photos];
  if (combined.length > 3) fail(400, 'Iň köp üç surat saýlaň. Öňki suratlary aýryň.');
  return {
    title: text(data.title, 90), ...place(data), address: text(data.address, 100),
    description: text(data.description, 2400), mode: data.mode, type: data.type,
    price: number(data.price, 1, 1e9), area: number(data.area, 1, 1e6), rooms: number(data.rooms, 0, 100, true),
    features: [...new Set(data.features)], photos: combined
  };
}
function sessionUser(req) {
  const cookie = req.headers.cookie || '';
  const token = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('salgy_session='))?.slice(14);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return one('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND expires > ?', hashToken(token), Date.now()) || null;
}
function sessionCookie(req, token, seconds) {
  const secure = process.env.COOKIE_SECURE === 'true' || !!req.socket.encrypted;
  return `salgy_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}
function authenticate(req, res, user) {
  sql('DELETE FROM sessions WHERE expires < ?', Date.now());
  const token = randomBytes(32).toString('hex');
  sql('INSERT INTO sessions VALUES (?, ?, ?)', hashToken(token), user.id, Date.now() + ttl);
  res.setHeader('Set-Cookie', sessionCookie(req, token, ttl / 1000));
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON gerek.');
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1800000) fail(413, 'Maglumat örän uly.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Nädogry JSON.');
    return data;
  } catch { fail(400, 'Nädogry JSON.'); }
}
function limit(req, kind, max) {
  const now = Date.now();
  if (rate.size > 10000) for (const [key, value] of rate) if (value.until < now) rate.delete(key);
  const key = `${req.socket.remoteAddress}:${kind}`;
  const record = rate.get(key);
  if (!record || record.until < now) rate.set(key, { count: 1, until: now + 60000 });
  else if (++record.count > max) fail(429, 'Biraz soň täzeden synanyşyň.');
}
function state(user) {
  return {
    me: user ? { id: user.id, email: user.email, name: user.name } : false,
    listings: rows('SELECT * FROM listings WHERE active = 1 OR user_id = ? ORDER BY created DESC', user?.id || '').map(row => ({ ...JSON.parse(row.data), id: row.id, active: !!row.active, created: row.created, owned: row.user_id === user?.id })),
    records: user ? rows('SELECT kind, id, data FROM records WHERE user_id = ?', user.id).map(row => ({ ...row, data: JSON.parse(row.data) })) : [],
    agents: rows('SELECT * FROM agents').map(row => ({ ...JSON.parse(row.data), owned: row.user_id === user?.id })),
    inquiries: user ? rows('SELECT inquiries.*, listings.data AS listing, users.email FROM inquiries JOIN listings ON listings.id = inquiries.listing_id JOIN users ON users.id = inquiries.sender_id WHERE sender_id = ? OR recipient_id = ? ORDER BY inquiries.created DESC', user.id, user.id).map(row => ({ ...JSON.parse(row.data), id: row.id, created: row.created, title: JSON.parse(row.listing).title, email: row.email, incoming: row.recipient_id === user.id })) : []
  };
}
async function api(req, res, path) {
  const method = req.method;
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) fail(405, 'Bu amal elýeterli däl.');
  if (method !== 'GET') {
    if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Nädogry çeşme.');
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}` && origin !== process.env.APP_ORIGIN) fail(403, 'Nädogry çeşme.');
    // JSON content type also prevents cross-origin simple form requests.
    if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON gerek.');
    limit(req, 'write', 100);
  }
  const user = sessionUser(req);
  if (path === 'state' && method === 'GET') return json(res, 200, state(user));
  if (path === 'assistant-status' && method === 'GET') return json(res, 200, { configured: false, mode: 'search-parser' });
  if (path === 'assistant' && method === 'POST') {
    const data = await body(req);
    const query = text(data.query, 800);
    return json(res, 200, { filters: parseRequest(query), reply: '' });
  }
  if ((path === 'auth/register' || path === 'auth/login') && method === 'POST') {
    limit(req, 'auth', 15);
    const data = await body(req);
    const email = text(data.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'E-poçta salgysyny dogry giriziň.');
    if (typeof data.password !== 'string' || data.password.length < 10 || data.password.length > 128) fail(400, 'Açar sözi 10–128 belgiden ybarat bolmaly.');
    let account = one('SELECT * FROM users WHERE email = ?', email);
    if (path === 'auth/register') {
      if (account) fail(409, 'Bu e-poçta eýýäm ulanylýar. Hasaba giriň.');
      const name = text(data.name, 80);
      const salt = randomBytes(16).toString('hex');
      account = { id: randomUUID(), email, name, salt, hash: scryptSync(data.password, salt, 64).toString('hex') };
      sql('INSERT INTO users VALUES (?, ?, ?, ?, ?)', account.id, email, account.hash, salt, name);
      sql('INSERT INTO records VALUES (?, ?, ?, ?)', account.id, 'profile', 'main', JSON.stringify({ name, phone: '', about: '' }));
    } else {
      const candidate = scryptSync(data.password, account?.salt || 'salgy-dummy-salt', 64);
      if (!account || !timingSafeEqual(candidate, Buffer.from(account.hash, 'hex'))) fail(401, 'E-poçta ýa-da açar sözi nädogry.');
    }
    authenticate(req, res, account);
    return json(res, 200, { ok: true });
  }
  if (path === 'auth/logout' && method === 'POST') {
    const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('salgy_session='))?.slice(14);
    if (token) sql('DELETE FROM sessions WHERE token = ?', hashToken(token));
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return json(res, 200, { ok: true });
  }
  if (!user) fail(401, 'Hasabyňyza giriň.');
  if (path === 'listings' && method === 'POST') {
    const data = listingData(await body(req));
    const id = randomUUID();
    sql('INSERT INTO listings VALUES (?, ?, ?, 1, ?)', id, user.id, JSON.stringify(data), Date.now());
    return json(res, 201, { id });
  }
  const listingMatch = path.match(/^listings\/([\w-]+)(\/status)?$/);
  if (listingMatch && method === 'PUT') {
    const listing = one('SELECT * FROM listings WHERE id = ? AND user_id = ?', listingMatch[1], user.id);
    if (!listing) fail(404, 'Bildiriş tapylmady.');
    const data = await body(req);
    if (listingMatch[2]) {
      if (typeof data.active !== 'boolean') fail(400, 'Nädogry baha.');
      sql('UPDATE listings SET active = ? WHERE id = ?', Number(data.active), listing.id);
    } else sql('UPDATE listings SET data = ? WHERE id = ?', JSON.stringify(listingData(data, JSON.parse(listing.data))), listing.id);
    return json(res, 200, { ok: true });
  }
  const recordMatch = path.match(/^records\/(favorite|search|checklist|profile)\/([\w-]{1,80})$/);
  if (recordMatch && ['PUT', 'DELETE'].includes(method)) {
    const [, kind, id] = recordMatch;
    if (method === 'DELETE') sql('DELETE FROM records WHERE user_id = ? AND kind = ? AND id = ?', user.id, kind, id);
    else {
      const data = await body(req);
      let value;
      if (kind === 'favorite') {
        if (!one('SELECT id FROM listings WHERE id = ? AND (active = 1 OR user_id = ?)', id, user.id)) fail(404, 'Bildiriş tapylmady.');
        value = {};
      } else if (kind === 'profile') {
        if (id !== 'main') fail(400, 'Nädogry profil.');
        value = { name: text(data.name, 80), phone: text(data.phone ?? '', 30, false), about: text(data.about ?? '', 800, false) };
      } else if (kind === 'checklist') {
        if (id !== 'main' || !Array.isArray(data.checked) || data.checked.length > 6 || data.checked.some(item => typeof item !== 'string' || !/^[0-5]$/.test(item))) fail(400, 'Nädogry meýilnama.');
        value = { checked: [...new Set(data.checked)] };
      } else {
        const f = data.filters;
        if (!f || typeof f !== 'object' || Array.isArray(f)) fail(400, 'Nädogry gözleg.');
        const filters = {};
        if (f.location) filters.location = text(f.location, 80);
        if (f.mode) { if (!modes.includes(f.mode)) fail(400, 'Nädogry geleşik.'); filters.mode = f.mode; }
        if (f.type) { if (!types.includes(f.type)) fail(400, 'Nädogry görnüş.'); filters.type = f.type; }
        for (const key of ['min', 'max', 'rooms', 'minArea']) if (f[key]) filters[key] = number(f[key], 0, 1e9);
        if (f.features) {
          if (!Array.isArray(f.features) || f.features.some(item => !features.includes(item))) fail(400, 'Nädogry aýratynlyk.');
          filters.features = [...new Set(f.features)];
        }
        if (filters.min !== undefined && filters.max !== undefined && filters.min > filters.max) fail(400, 'Minimum price exceeds maximum price.');
        value = { title: text(data.title, 80), filters, created: Date.now() };
      }
      sql('INSERT INTO records VALUES (?, ?, ?, ?) ON CONFLICT(user_id,kind,id) DO UPDATE SET data = excluded.data', user.id, kind, id, JSON.stringify(value));
    }
    return json(res, 200, { ok: true });
  }
  if (path === 'agent' && method === 'PUT') {
    const data = await body(req);
    const value = { name: text(data.name, 80), agency: text(data.agency, 80), ...place(data), phone: text(data.phone, 30), about: text(data.about, 800) };
    if (!/^\+?[\d\s()-]{5,30}$/.test(value.phone)) fail(400, 'Telefon belgisini dogry giriziň.');
    sql('INSERT INTO agents VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data', user.id, JSON.stringify(value));
    return json(res, 200, { ok: true });
  }
  const inquiryMatch = path.match(/^inquiries\/([\w-]+)(\/reply)?$/);
  if (inquiryMatch && method === 'POST') {
    const data = await body(req);
    let target;
    if (inquiryMatch[2]) {
      target = one('SELECT * FROM inquiries WHERE id = ? AND recipient_id = ?', inquiryMatch[1], user.id);
      if (!target) fail(404, 'Hat tapylmady.');
    } else {
      const listing = one('SELECT * FROM listings WHERE id = ? AND active = 1', inquiryMatch[1]);
      if (!listing) fail(404, 'Bildiriş tapylmady.');
      if (listing.user_id === user.id) fail(400, 'Öz bildirişiňize hat iberip bolmaz.');
      target = { sender_id: listing.user_id, listing_id: listing.id };
    }
    const value = { name: text(data.name, 80), message: text(data.message, 1800), visit: text(data.visit || '', 10, false) };
    if (value.visit && (!/^\d{4}-\d{2}-\d{2}$/.test(value.visit) || !Number.isFinite(Date.parse(value.visit)) || new Date(value.visit).toISOString().slice(0, 10) !== value.visit)) fail(400, 'Senäni dogry giriziň.');
    const id = randomUUID();
    sql('INSERT INTO inquiries VALUES (?, ?, ?, ?, ?, ?)', id, user.id, target.sender_id, target.listing_id, JSON.stringify(value), Date.now());
    return json(res, 201, { id });
  }
  fail(404, 'Tapylmady.');
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  try {
    const url = new URL(req.url, 'http://localhost');
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { fail(400, 'Malformed URL.'); }
    if (path.startsWith('/api/')) return await api(req, res, path.slice(5));
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'Bu amal elýeterli däl.');
    const file = resolve(publicRoot, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(publicRoot + sep)) fail(404, 'Tapylmady.');
    let content;
    try { if (!statSync(file).isFile()) fail(404, 'Tapylmady.'); content = readFileSync(file); } catch { fail(404, 'Tapylmady.'); }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': content.length });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Serwerde näsazlyk ýüze çykdy.' });
    else res.end();
    if (!error.status) console.error(error);
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => {
  console.log(`Salgy running at http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
