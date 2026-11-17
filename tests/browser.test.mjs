import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const browserPath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
function launched(child, expression) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Process startup timed out: ' + output)), 20000);
    const receive = chunk => {
      output += chunk;
      const match = output.match(expression);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    };
    child.stdout?.on('data', receive);
    child.stderr?.on('data', receive);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Process exited ' + code + ': ' + output)); });
  });
}
async function terminate(child) {
  if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
}

test('browser: accounts, publishing, searching, saved properties, calculators, map, and mobile layout', { skip: !browserPath, timeout: 90000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'salgy-browser-'));
  let server, browser, socket;
  try {
    server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '0', DATABASE_PATH: join(directory, 'test.sqlite') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const base = await launched(server, /http:\/\/127\.0\.0\.1:\d+/);
    browser = spawn(browserPath, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + join(directory, 'profile'), 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const endpoint = await launched(browser, /ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[\w-]+/);
    socket = new WebSocket(endpoint);
    await once(socket, 'open');
    let counter = 0;
    const pending = new Map();
    const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = pending.get(message.id);
        if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); }
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    });
    const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++counter;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => command(method, params, sessionId);
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const wait = async expression => {
      const until = Date.now() + 12000;
      do {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < until);
      throw new Error('Browser condition timed out: ' + expression + '\n' + await evaluate('document.body.innerText'));
    };
    const fill = async (kind, values) => evaluate(`(() => { const f=document.querySelector('[data-form="${kind}"]'); for(const [key,value] of Object.entries(${JSON.stringify(values)})) f.elements[key].value=value; f.requestSubmit(); })()`);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: base });
    await wait(`document.querySelector('#result-note')?.textContent==='0 bildiriş'`);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await evaluate(`document.querySelector('[data-action="publish"]').click()`);
    await wait(`!!document.querySelector('[data-form="login"]')`);
    await evaluate(`document.querySelector('[data-action="auth"]').click()`);
    await fill('register', { name: 'Browser test user', email: 'browser@example.test', password: 'Browser-password-123' });
    await wait(`!!document.querySelector('.account-overview')`);
    await evaluate(`document.querySelector('#dialog [data-action="publish"]').click()`);
    await evaluate(`(async()=>{ const response=await fetch('/images/ashgabat.jpg'); const blob=await response.blob(); const transfer=new DataTransfer(); transfer.items.add(new File([blob],'property.jpg',{type:'image/jpeg'})); document.querySelector('[data-form="publish"]').elements.photos.files=transfer.files; })()`);
    await fill('publish', { title: 'Browser integration property', address: 'Browser test address', price: '250000', area: '80', rooms: '3', description: 'A real test transaction in a temporary database.' });
    await wait(`!!document.querySelector('#dialog [data-action="toggle-listing"]')`);
    await evaluate(`document.querySelector('[data-action="close"]').click(); document.querySelector('#search').requestSubmit()`);
    await wait(`document.querySelectorAll('#result-grid .card').length===1`);
    await wait(`document.querySelector('.card img')?.naturalWidth>0`);
    await evaluate(`(async()=>{ const {default:places}=await import('/locations.js'); const region=Object.keys(places)[0]; const response=await fetch('/api/listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Rental test property',mode:'rent',type:'house',region,district:places[region][0],address:'Rental test address',description:'Isolated search regression fixture',price:1500,area:90,rooms:3,features:[],photos:[]})}); if(!response.ok)throw new Error(await response.text()); })()`);
    await send('Page.reload');
    await wait(`document.querySelectorAll('#result-grid .card').length===1`);
    await evaluate(`document.querySelector('#type').value='apartment';document.querySelector('nav [data-mode="rent"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#type').value`),'apartment','tab changes preserve compatible property types');
    await wait(`document.querySelectorAll('#result-grid .card').length===0`);
    await evaluate(`document.querySelector('#type').value='house';document.querySelector('#search').requestSubmit()`);
    await wait(`document.querySelectorAll('#result-grid .card').length===1`);
    await evaluate(`document.querySelector('[data-quick="rooms"]').click()`);
    assert.equal(await evaluate(`document.querySelector('.tabs [data-mode="rent"]').getAttribute('aria-pressed')`),'true','quick search keeps rent mode');
    assert.equal(await evaluate(`document.querySelector('#type').value`),'house','quick search keeps property type');
    assert.match(await evaluate(`document.querySelector('.card h3').textContent`),/Rental test property/);
    await evaluate(`document.querySelector('nav [data-mode="buy"]').click();document.querySelector('#type').value='apartment';document.querySelector('#search').requestSubmit()`);
    await wait(`document.querySelectorAll('#result-grid .card').length===1`);
    await evaluate(`document.querySelector('.card [data-action="favorite"]').click()`);
    await wait(`document.querySelector('.card [data-action="favorite"]').getAttribute('aria-pressed')==='true'`);
    await evaluate(`document.querySelector('.card [data-action="details"]').click()`);
    await wait(`document.querySelector('#dialog-title').textContent==='Browser integration property'`);
    await evaluate(`document.querySelector('[data-action="close"]').click(); document.querySelector('[data-action="finance"]').click()`);
    await fill('finance', { price: '100000', deposit: '0', rate: '0', years: '10' });
    await wait(`!document.querySelector('output').hidden`);
    assert.match(await evaluate(`document.querySelector('output').textContent`), /833\.33/);
    await evaluate(`document.querySelector('[data-action="close"]').click(); document.querySelector('[data-action="map"]').click()`);
    await wait(`document.querySelector('#dialog canvas')?.width===660`);
    await evaluate(`document.querySelector('[data-action="close"]').click(); document.querySelector('[data-action="assistant"]').click()`);
    await fill('assistant', { query: 'Aşgabatda 3 otagly kwartira 300000 TMT çenli' });
    await wait(`!!document.querySelector('[data-action="assistant-apply"]')`);
    assert.match(await evaluate(`document.querySelector('#assistant-answer').textContent`), /1 bildiriş/);
    await evaluate(`document.querySelector('[data-action="close"]').click()`);
    for(const width of [320,390,768]){
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'page must fit viewport at '+width);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.querySelector('[data-action="workspace"][data-tab="overview"]').click()`);
    await wait(`!!document.querySelector('.account-overview')`);
    await evaluate(`document.querySelector('[data-action="logout"]').click()`);
    await wait(`!document.querySelector('#dialog').open`);
    await evaluate(`document.querySelector('[data-action="workspace"][data-tab="overview"]').click()`);
    await fill('login', { email: 'browser@example.test', password: 'Browser-password-123' });
    await wait(`!!document.querySelector('.account-overview')`);
    assert.deepEqual(errors, [], 'browser JavaScript must not raise exceptions');
  } finally {
    socket?.close();
    await terminate(browser);
    await terminate(server);
    // Browser helpers can take a moment to release profile files on Windows.
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
