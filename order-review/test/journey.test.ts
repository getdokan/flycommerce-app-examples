import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { type FakeOrder, type FakePlatform, FakeStore, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { type App, createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;
const STORE = 'demo.flycom.shop';
const SCOPES = ['orders.read', 'orders.write', 'webhooks.manage'];

let platform: FakePlatform;
let app: App;
let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  const port = await freePort();
  const appUrl = `http://localhost:${port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-review-'));

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-secret',
    redirectUri: `${appUrl}/auth/callback`,
  });
  app = createApp({
    ...platform.env,
    APP_URL: appUrl,
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    DATA_FILE: path.join(dir, 'data.json'),
    CREDENTIALS_FILE: path.join(dir, 'credentials.json'),
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

test('installs: keeps the store credential and subscribes to order.created', async () => {
  const { callbackUrl } = platform.hub.install(APP_ID, { store: STORE, scopes: SCOPES });
  const response = await fetch(callbackUrl, { redirect: 'manual' });

  assert.equal(response.status, 200);
  assert.ok(app.config.credentials.get(STORE));

  assert.deepEqual(
    platform.store.store(STORE).webhookList.map((webhook) => webhook.events),
    [['order.created']]
  );
});

test('knows which store and user is asking, and refuses anyone else', async () => {
  assert.deepEqual(await (await asOwner('/api/me')).json(), { store: STORE, userId: '1', role: 'owner' });
  assert.equal((await fetch(`${server.url}/api/me`)).status, 401);

  const otherApp = platform.hub.sessionToken({ appId: 'another-app', store: STORE });
  assert.equal((await fetch(`${server.url}/api/me`, { headers: { Authorization: `Bearer ${otherApp}` } })).status, 401);
});

test('a big order lands in the review queue; a small one does not', async () => {
  await asOwner('/api/settings', { method: 'PUT', body: { limit: 1000 } });
  const big = await placeOrder(1500);
  await placeOrder(200);

  assert.deepEqual(await queue(), [big.id]);
  assert.equal(platform.store.requests.at(-1)?.userId, '1', 'the queue is read as the user');
});

test('the same delivery twice queues the order once, and a forged one is refused', async () => {
  const order = await placeOrder(3000);
  await platform.store.deliver(STORE, 'order.created', FakeStore.rawOrder(order));

  assert.equal((await queue()).filter((id) => id === order.id).length, 1);

  const body = JSON.stringify({ event: 'order.created', data: FakeStore.rawOrder(order) });
  const forged = await fetch(`${server.url}/webhooks/order-created?store=${STORE}`, {
    method: 'POST',
    headers: { 'X-Webhook-Signature': 'ab'.repeat(32) },
    body,
  });
  assert.equal(forged.status, 401);
});

async function placeOrder(total: number): Promise<FakeOrder> {
  const order = platform.store.store(STORE).addOrder({ total });
  const [delivery] = await platform.store.deliver(STORE, 'order.created', FakeStore.rawOrder(order));

  assert.equal(delivery?.status, 200);
  return order;
}

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
