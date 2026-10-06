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
const OCT_3 = '2026-10-03T00:00:00.000Z';

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

test('exports every order in the period, oldest first, as the user', async () => {
  const store = platform.store.store(STORE);
  store.addOrder({ createdAt: '2026-09-30T23:59:59.000Z' });
  // More than one page: the export has to keep asking until the store runs out.
  for (let i = 0; i < 60; i++) {
    store.addOrder({ total: 10 + i, createdAt: new Date(Date.parse(OCT_1) + i * 60_000).toISOString() });
  }
  store.addOrder({ createdAt: OCT_2 });

  const response = await exportAsOwner(OCT_1, OCT_2);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const lines = new TextDecoder().decode(bytes).trimEnd().split('\r\n');

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/csv/);
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'a byte-order mark, so Excel reads UTF-8');
  assert.equal(lines[0], 'Order,Placed,Customer,Email,Status,Total,Currency');
  assert.equal(lines.length, 61, 'the header and the 60 orders placed on October 1');
  assert.match(lines[1], /,2026-10-01T00:00:00.000Z,Nadia Rahman,buyer\d+@example.test,processing,10,USD$/);
  assert.equal(platform.store.requests.at(-1)?.userId, '1', 'orders are read as the user');
});

test('keeps names a spreadsheet would misread as text', async () => {
  const store = platform.store.store(STORE);
  store.addOrder({ firstName: 'Sam', lastName: 'O"Neil, Jr', createdAt: '2026-10-02T09:00:00.000Z' });
  store.addOrder({
    firstName: '=HYPERLINK("https://example.test")',
    lastName: 'Test',
    createdAt: '2026-10-02T10:00:00.000Z',
  });

  const csv = await (await exportAsOwner(OCT_2, OCT_3)).text();

  assert.ok(csv.includes(',"Sam O""Neil, Jr",'), csv);
  assert.ok(csv.includes(`,"'=HYPERLINK(""https://example.test"") Test",`), csv);
});

test('refuses a period that ends before it starts', async () => {
  const response = await exportAsOwner(OCT_2, OCT_1);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, 'Choose a start date on or before the end date.');
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
