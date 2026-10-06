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
const OTHER_STORE = 'other.flycom.shop';
const ALL_COLUMNS = 'order,placed,customer,email,status,total,currency';
const OCT_1 = '2026-10-01T00:00:00.000Z';
const OCT_2 = '2026-10-02T00:00:00.000Z';
const OCT_3 = '2026-10-03T00:00:00.000Z';

let platform: FakePlatform;
let app: App;
let server: Awaited<ReturnType<typeof startServer>>;
let dataFile: string;

before(async () => {
  const port = await freePort();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'order-export-'));
  dataFile = path.join(folder, 'order-export.json');

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-secret',
    redirectUri: `http://localhost:${port}/auth/callback`,
  });
  app = createApp({
    ...platform.env,
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    CREDENTIALS_FILE: path.join(folder, 'credentials.json'),
    DATA_FILE: dataFile,
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

  const response = await exportAsOwner(OCT_1, OCT_2, ALL_COLUMNS);
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

  const csv = await (await exportAsOwner(OCT_2, OCT_3, ALL_COLUMNS)).text();

  assert.ok(csv.includes(',"Sam O""Neil, Jr",'), csv);
  assert.ok(csv.includes(`,"'=HYPERLINK(""https://example.test"") Test",`), csv);
});

test('refuses a period that ends before it starts', async () => {
  const response = await exportAsOwner(OCT_2, OCT_1, ALL_COLUMNS);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, 'Choose a start date on or before the end date.');
});

test("writes only the chosen columns, in the file's order", async () => {
  platform.store.store(STORE).addOrder({ total: 42, createdAt: '2026-10-03T09:00:00.000Z' });

  const csv = await (await exportAsOwner(OCT_3, '2026-10-04T00:00:00.000Z', 'total,order,placed')).text();
  const lines = csv.replace('\uFEFF', '').trimEnd().split('\r\n');

  assert.equal(lines[0], 'Order,Placed,Total');
  assert.match(lines[1], /^\d+,2026-10-03T09:00:00.000Z,42$/);
});

test('refuses unknown or no columns', async () => {
  const unknown = await exportAsOwner(OCT_1, OCT_2, 'order,secret');
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).message, `Choose columns from: ${ALL_COLUMNS.replaceAll(',', ', ')}.`);

  const none = await exportAsOwner(OCT_1, OCT_2, '');
  assert.equal(none.status, 400);
  assert.equal((await none.json()).message, 'Choose at least one column.');
});

test('a new store starts from the default settings', async () => {
  const response = await settingsAsOwner(STORE);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    store: STORE,
    fileName: 'orders-{from}-to-{to}',
    columns: ALL_COLUMNS.split(','),
  });
});

test('keeps the settings it saved', async () => {
  const saved = await settingsAsOwner(STORE, { fileName: ' {store} orders {from} ', columns: ['total', 'order'] });
  assert.equal(saved.status, 200);

  const kept = { fileName: '{store} orders {from}', columns: ['order', 'total'] };
  assert.deepEqual(await (await settingsAsOwner(STORE)).json(), { store: STORE, ...kept });
  assert.deepEqual(JSON.parse(fs.readFileSync(dataFile, 'utf8'))[STORE], kept, 'kept on disk, under its store');
});

test('refuses a file name format that could escape a file name', async () => {
  const onlySafe = 'Use only letters, digits, spaces, "-", "_", "." and the placeholders {store}, {from} and {to}.';
  const refused = [
    ['', 'Enter a file name format.'],
    ['x'.repeat(101), 'Keep the file name format to 100 characters or fewer.'],
    ['../orders', onlySafe],
    ['orders\r\nSet-Cookie: x', onlySafe],
    ['orders-{year}', onlySafe],
  ];

  for (const [fileName, message] of refused) {
    const response = await settingsAsOwner(STORE, { fileName, columns: ['order'] });
    assert.equal(response.status, 400, fileName);
    assert.equal((await response.json()).message, message);
  }
});

test("keeps each store's settings to itself", async () => {
  const { callbackUrl } = platform.hub.install(APP_ID, { store: OTHER_STORE, scopes: ['orders.read'] });
  await fetch(callbackUrl, { redirect: 'manual' });

  await settingsAsOwner(STORE, { fileName: 'demo-only', columns: ['email'] });
  const other = await (await settingsAsOwner(OTHER_STORE)).json();
  assert.equal(other.store, OTHER_STORE);
  assert.equal(other.fileName, 'orders-{from}-to-{to}');
  assert.deepEqual(other.columns, ALL_COLUMNS.split(','));

  await settingsAsOwner(OTHER_STORE, { fileName: 'other-only', columns: ['status'] });
  await settingsAsOwner(STORE, { fileName: 'demo-again', columns: ['email'] });
  assert.equal((await (await settingsAsOwner(OTHER_STORE)).json()).fileName, 'other-only');
  assert.equal((await (await settingsAsOwner(STORE)).json()).fileName, 'demo-again');
});

function exportAsOwner(from: string, to: string, columns: string): Promise<Response> {
  const query = new URLSearchParams({ from, to, columns });

  return fetch(`${server.url}/api/export?${query}`, { headers: { Authorization: `Bearer ${ownerToken(STORE)}` } });
}

function settingsAsOwner(store: string, save?: { fileName: string; columns: string[] }): Promise<Response> {
  const headers = { Authorization: `Bearer ${ownerToken(store)}`, 'Content-Type': 'application/json' };

  return fetch(
    `${server.url}/api/settings`,
    save ? { method: 'PUT', headers, body: JSON.stringify(save) } : { headers }
  );
}

function ownerToken(store: string): string {
  return platform.hub.sessionToken({ appId: APP_ID, store, userId: '1', role: 'owner' });
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
