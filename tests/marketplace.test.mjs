import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const directory = mkdtempSync(join(tmpdir(), 'salgy-test-'));
let child;
let base;
async function start() {
  child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '0', DATABASE_PATH: join(directory, 'test.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start: ' + output)), 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code + ' ' + output)); });
  });
}
async function stop() {
  if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
}
async function request(path, { cookie, method = 'GET', data, origin } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const value = await response.json();
  return { status: response.status, value, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}
const property = { title: 'Integration test property', mode: 'buy', type: 'apartment', region: 'Aşgabat', district: 'Berkararlyk', address: 'Test address', description: 'Created in an isolated test database.', price: '300000', area: '85', rooms: '3', features: ['balcony'], photos: [] };

test('marketplace uses real persistent data and enforces account boundaries', async t => {
  try {
    await start();
    await t.test('empty database and local assets', async () => {
      const state = await request('/api/state');
      assert.equal(state.status, 200);
      assert.deepEqual(state.value.listings, []);
      assert.equal(state.value.me, false);
      const page = await fetch(base);
      assert.equal(page.status, 200);
      assert.ok(!(await page.text()).includes('challenge-platform'));
      for (const file of ['style.css', 'app.js', 'assistant.js', 'locations.js', 'map.js', 'boundaries.json', 'images/ashgabat.jpg', 'images/turkmenbashy.jpg', 'favicon.svg']) {
        const response = await fetch(base + '/' + file);
        assert.equal(response.status, 200, file);
        assert.ok((await response.arrayBuffer()).byteLength > 20, file);
      }
      assert.ok(!readFileSync('public/app.js', 'utf8').includes('const examples'));
    });
    const credentials = { email: 'owner@example.test', password: 'A-strong-password-123', name: 'Test owner' };
    const owner = await request('/api/auth/register', { method: 'POST', data: credentials });
    assert.equal(owner.status, 200);
    assert.match(owner.headers.get('set-cookie'), /HttpOnly/);
    const cookie = owner.cookie;
    const buyer = await request('/api/auth/register', { method: 'POST', data: { ...credentials, email: 'buyer@example.test', name: 'Test buyer' } });
    assert.equal(buyer.status, 200);
    await t.test('authentication and request protection', async () => {
      assert.equal((await request('/api/listings', { method: 'POST', data: property })).status, 401);
      assert.equal((await request('/api/auth/login', { method: 'POST', data: { ...credentials, password: 'wrong-password' } })).status, 401);
      assert.equal((await request('/api/auth/register', { method: 'POST', data: credentials })).status, 409);
      assert.equal((await request('/api/listings', { method: 'POST', cookie, data: property, origin: 'https://attacker.test' })).status, 403);
      assert.equal((await fetch(base + '/api/listings', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    });
    const created = await request('/api/listings', { method: 'POST', cookie, data: property });
    assert.equal(created.status, 201);
    const id = created.value.id;
    await t.test('validation, ownership, editing, and archiving', async () => {
      assert.equal((await request('/api/listings', { method: 'POST', cookie, data: { ...property, price: '-1' } })).status, 400);
      assert.equal((await request('/api/listings', { method: 'POST', cookie, data: { ...property, district: 'Invalid' } })).status, 400);
      assert.equal((await request('/api/listings', { method: 'POST', cookie, data: { ...property, photos: ['data:image/jpeg;base64,YmFk'] } })).status, 400);
      assert.equal((await request('/api/listings/' + id, { method: 'PUT', cookie: buyer.cookie, data: property })).status, 404);
      assert.equal((await request('/api/listings/' + id, { method: 'PUT', cookie, data: { ...property, price: '320000' } })).status, 200);
      const listing = (await request('/api/state')).value.listings[0];
      assert.equal(listing.price, 320000);
      assert.equal((await request('/api/listings', { method: 'POST', cookie, data: { ...property, rooms: '   ' } })).status, 400);
      assert.equal((await fetch(base + '/%ZZ')).status, 400);
      assert.equal(listing.owned, false);
      assert.equal('user_id' in listing, false);
      assert.equal((await request('/api/listings/' + id + '/status', { method: 'PUT', cookie, data: { active: false } })).status, 200);
      assert.equal((await request('/api/state')).value.listings.length, 0);
      assert.equal((await request('/api/state', { cookie })).value.listings[0].active, false);
      await request('/api/listings/' + id + '/status', { method: 'PUT', cookie, data: { active: true } });
    });
    await t.test('favorites, saved searches, profile, agents, and moving checklist', async () => {
      for (const [kind, key, data] of [
        ['favorite', id, {}],
        ['search', 'my-search', { title: 'My search', filters: { location: 'Aşgabat', rooms: '3' } }],
        ['profile', 'main', { name: 'Updated owner', phone: '+99361000000', about: 'Property owner' }],
        ['checklist', 'main', { checked: ['0', '2'] }]
      ]) assert.equal((await request('/api/records/' + kind + '/' + key, { method: 'PUT', cookie, data })).status, 200);
      assert.equal((await request('/api/records/checklist/main', { method: 'PUT', cookie, data: { checked: [0] } })).status, 400);
      assert.equal((await request('/api/records/search/invalid-range', { method: 'PUT', cookie, data: { title: 'Invalid', filters: { min: 1000, max: 100 } } })).status, 400);
      const records = (await request('/api/state', { cookie })).value.records;
      assert.equal(records.length, 4);
      assert.equal((await request('/api/state', { cookie: buyer.cookie })).value.records.length, 1);
      const agent = await request('/api/agent', { method: 'PUT', cookie, data: { name: 'Agent', agency: 'Agency', region: 'Aşgabat', district: 'Köpetdag', phone: '+99361000000', about: 'Services' } });
      assert.equal(agent.status, 200);
      assert.equal((await request('/api/state')).value.agents.length, 1);
      await request('/api/records/favorite/' + id, { method: 'DELETE', cookie });
      assert.equal((await request('/api/state', { cookie })).value.records.some(row => row.kind === 'favorite'), false);
    });
    await t.test('messages and replies reach the correct accounts', async () => {
      const message = await request('/api/inquiries/' + id, { method: 'POST', cookie: buyer.cookie, data: { name: 'Buyer', message: 'Can I arrange a viewing?', visit: '2026-12-01' } });
      assert.equal(message.status, 201);
      assert.equal((await request('/api/inquiries/' + id, { method: 'POST', cookie: buyer.cookie, data: { name: 'Buyer', message: 'Invalid date', visit: '2026-02-30' } })).status, 400);
      const inbox = (await request('/api/state', { cookie })).value.inquiries;
      assert.equal(inbox.length, 1);
      assert.equal(inbox[0].incoming, true);
      assert.equal((await request('/api/inquiries/' + message.value.id + '/reply', { method: 'POST', cookie: buyer.cookie, data: { name: 'Buyer', message: 'Unauthorized reply' } })).status, 404);
      assert.equal((await request('/api/inquiries/' + message.value.id + '/reply', { method: 'POST', cookie, data: { name: 'Owner', message: 'Yes, please arrange a time.' } })).status, 201);
      const buyerInbox = (await request('/api/state', { cookie: buyer.cookie })).value.inquiries;
      assert.equal(buyerInbox.length, 2);
      assert.ok(buyerInbox.some(item => item.incoming));
      assert.deepEqual((await request('/api/state')).value.inquiries, []);
    });
    await t.test('natural-language search uses the real parser', async () => {
      const result = await request('/api/assistant', { method: 'POST', data: { query: 'Aşgabatda 3 otagly kwartira 400000 TMT çenli' } });
      assert.equal(result.status, 200);
      assert.equal(result.value.filters.location, 'Aşgabat');
      assert.equal(result.value.filters.rooms, 3);
      assert.equal(result.value.filters.max, 400000);
    });
    await t.test('data and sessions survive a server restart', async () => {
      await stop();
      await start();
      const persisted = await request('/api/state', { cookie });
      assert.equal(persisted.value.me.email, credentials.email);
      assert.equal(persisted.value.listings[0].price, 320000);
      assert.equal(persisted.value.records.find(row => row.kind === 'profile').data.name, 'Updated owner');
      assert.equal(persisted.value.inquiries.length, 2);
      assert.equal((await request('/api/auth/logout', { method: 'POST', cookie, data: {} })).status, 200);
      assert.equal((await request('/api/state', { cookie })).value.me, false);
      assert.equal((await request('/api/auth/login', { method: 'POST', data: credentials })).status, 200);
    });
  } finally {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
