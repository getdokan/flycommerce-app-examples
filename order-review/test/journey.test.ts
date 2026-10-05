import assert from 'node:assert/strict';
import fs from 'node:fs';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { type FakePlatform, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;
const STORE = 'demo.flycom.shop';
const SCOPES = ['orders.read', 'orders.write', 'webhooks.manage'];

let platform: FakePlatform;
let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  const port = await freePort();
  const appUrl = `http://localhost:${port}`;

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-secret',
    redirectUri: `${appUrl}/auth/callback`,
  });
  const app = createApp({
    ...platform.env,
    DATA_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'order-review-')), 'data.json'),
  });
  server = await startServer(app, port);
});

after(async () => {
  await server.close();
  await platform.close();
});

test('serves its pages for the dashboard to frame', async () => {
  const response = await fetch(`${server.url}/queue`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /^frame-ancestors /);
  assert.ok(html.includes(`<meta name="flycom-app-id" content="${APP_ID}">`));

  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.equal((await fetch(`${server.url}${script}`)).status, 200);
});

test('knows which store and user is asking, and refuses anyone else', async () => {
  assert.deepEqual(await (await asOwner('/api/me')).json(), { store: STORE, userId: '1', role: 'owner' });
  assert.equal((await fetch(`${server.url}/api/me`)).status, 401);

  const otherApp = platform.hub.sessionToken({ appId: 'another-app', store: STORE });
  assert.equal((await fetch(`${server.url}/api/me`, { headers: { Authorization: `Bearer ${otherApp}` } })).status, 401);
});

test("shows only orders over the store's limit, read as the user", async () => {
  platform.hub.install(APP_ID, { store: STORE, scopes: SCOPES });
  const big = platform.store.store(STORE).addOrder({ total: 1500 });
  platform.store.store(STORE).addOrder({ total: 200 });
  await asOwner('/api/settings', { method: 'PUT', body: { limit: 1000 } });

  assert.deepEqual(await queue(), [big.id]);
  assert.equal(platform.store.requests.at(-1)?.userId, '1', 'the orders are read as the user');
});

function asOwner(pathname: string, send?: { method: string; body: unknown }): Promise<Response> {
  const token = platform.hub.sessionToken({ appId: APP_ID, store: STORE, userId: '1', role: 'owner' });

  return fetch(`${server.url}${pathname}`, {
    method: send?.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: send && JSON.stringify(send.body),
  });
}

async function queue(): Promise<string[]> {
  const { orders } = await (await asOwner('/api/queue')).json();
  return orders.map((order: { id: string }) => order.id);
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
