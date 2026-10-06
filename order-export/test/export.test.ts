import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { type FakePlatform, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { type App, createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;
const STORE = 'demo.flycom.shop';
const OCT_1 = '2026-10-01T00:00:00.000Z';
const OCT_2 = '2026-10-02T00:00:00.000Z';

let platform: FakePlatform;
let app: App;
let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  const port = await freePort();

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-secret',
    redirectUri: `http://localhost:${port}/auth/callback`,
  });
  app = createApp({
    ...platform.env,
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    CREDENTIALS_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'order-export-')), 'credentials.json'),
  });
  server = await startServer(app, port);
});

after(async () => {
  await server.close();
  await platform.close();
});

test('serves its page for the dashboard to frame', async () => {
  const response = await fetch(`${server.url}/export`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /^frame-ancestors /);
  assert.ok(html.includes(`<meta name="flycom-app-id" content="${APP_ID}">`));
});

test('installs: keeps the store credential', async () => {
  const { callbackUrl } = platform.hub.install(APP_ID, { store: STORE, scopes: ['orders.read'] });
  const response = await fetch(callbackUrl, { redirect: 'manual' });

  assert.equal(response.status, 200);
  assert.ok(app.config.credentials.get(STORE));
});

test('refuses a request without a session token from this app', async () => {
  assert.equal((await fetch(`${server.url}/api/export?from=${OCT_1}&to=${OCT_2}`)).status, 401);

  const otherApp = platform.hub.sessionToken({ appId: 'another-app', store: STORE });
  const response = await fetch(`${server.url}/api/export?from=${OCT_1}&to=${OCT_2}`, {
    headers: { Authorization: `Bearer ${otherApp}` },
  });
  assert.equal(response.status, 401);
});

test('answers the page with a CSV file', async () => {
  const response = await exportAsOwner(OCT_1, OCT_2);
  const bytes = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/csv/);
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'a byte-order mark, so Excel reads UTF-8');
  assert.equal(new TextDecoder().decode(bytes), 'Order,Placed,Customer,Email,Status,Total,Currency\r\n');
});

function exportAsOwner(from: string, to: string): Promise<Response> {
  const token = platform.hub.sessionToken({ appId: APP_ID, store: STORE, userId: '1', role: 'owner' });
  const query = new URLSearchParams({ from, to });

  return fetch(`${server.url}/api/export?${query}`, { headers: { Authorization: `Bearer ${token}` } });
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
