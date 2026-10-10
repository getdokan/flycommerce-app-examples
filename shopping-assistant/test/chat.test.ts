import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { type FakePlatform, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { understand } from '../src/search.js';
import { createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;
const STORE = 'teahouse.flycom.shop';
const UNNAMED_STORE = 'unnamed.flycom.shop';
const NADIA = 1001;

let platform: FakePlatform;
let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  const port = await freePort();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-assistant-'));

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-secret',
    redirectUri: `http://localhost:${port}/auth/callback`,
  });
  server = await startServer(
    createApp({
      ...platform.env,
      APP_URL: `http://localhost:${port}`,
      ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
      CREDENTIALS_FILE: path.join(folder, 'credentials.json'),
    }),
    port
  );

  for (const domain of [STORE, UNNAMED_STORE]) {
    const store = platform.store.store(domain);
    store.addProduct({ title: 'Darjeeling green tea', price: 14 });
    store.addProduct({ title: 'Jasmine green tea bags', price: 6 });
    store.addProduct({ title: 'Glass teapot', price: 24, description: 'For loose leaf tea' });
    store.addOrder({ customerId: NADIA, total: 26 });
    store.addOrder({ customerId: 2002, total: 99 });
  }

  await install(STORE, ['catalog.read', 'orders.read', 'storefront.scripts', 'storefront.customer']);
  // This merchant didn't let the app know who is signed in.
  await install(UNNAMED_STORE, ['catalog.read', 'orders.read', 'storefront.scripts']);
});

after(async () => {
  await server.close();
  await platform.close();
});

test('reads the words and the top price out of a question', () => {
  assert.deepEqual(understand('Do you have green tea under 20?'), { words: 'green tea', maxPrice: 20 });
  assert.deepEqual(understand('teapot < $30'), { words: 'teapot', maxPrice: 30 });
  assert.deepEqual(understand('mugs'), { words: 'mugs', maxPrice: null });
});

test('finds products for a guest, within the price asked for', async () => {
  const reply = await chat(STORE, 'green tea under 20');

  assert.deepEqual(
    reply.products?.map((product) => [product.title, product.price]),
    [
      ['Darjeeling green tea', 14],
      ['Jasmine green tea bags', 6],
    ]
  );
  assert.ok(
    reply.products?.every((product) => product.id && product.slug),
    'each card can be added and opened'
  );
});

test('says so when nothing matches, and offers what to try', async () => {
  const reply = await chat(STORE, 'teapot under 10');

  assert.equal(reply.text, 'I couldn\'t find "teapot" for 10 or less.');
  assert.ok(reply.suggestions?.length);
});

test('shows a signed-in customer only their own orders', async () => {
  const reply = await chat(STORE, "where's my order?", NADIA);

  assert.equal(reply.text, 'Your order:');
  assert.equal(reply.orders?.length, 1);
  assert.match(reply.orders![0].total, /^26\.00 USD$/);
  assert.match(platform.store.requests.at(-1)?.query ?? '', /filters%5BcustomerId%5D=1001/);
});

test('asks a guest to sign in before looking up orders', async () => {
  const reply = await chat(STORE, 'where is my order');

  assert.match(reply.text, /^Sign in/);
  assert.equal(reply.orders, undefined);
});

test("can't look up orders where the merchant didn't grant storefront.customer", async () => {
  const reply = await chat(UNNAMED_STORE, 'track my order', NADIA);

  assert.equal(reply.text, "This store hasn't let me see who you are. Your orders are on your account page.");
});

test('refuses a request without a valid shopper token, from any origin', async () => {
  const missing = await fetch(`${server.url}/api/chat`, { method: 'POST', body: JSON.stringify({ message: 'hi' }) });
  const forged = await fetch(`${server.url}/api/chat`, {
    method: 'POST',
    headers: { Authorization: 'Bearer not.a.token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hi' }),
  });
  const preflight = await fetch(`${server.url}/api/chat`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://teahouse.flycom.shop' },
  });

  assert.equal(missing.status, 401);
  assert.equal(forged.status, 401);
  assert.equal(forged.headers.get('access-control-allow-origin'), '*', 'the bubble can read the refusal');
  assert.equal(preflight.status, 204);
});

test('serves the bubble with its App ID and server filled in', async () => {
  const response = await fetch(`${server.url}/storefront/assistant.js`);
  const script = await response.text();

  assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
  assert.ok(script.includes(`var APP_ID = ${JSON.stringify(APP_ID)};`));
  assert.ok(script.includes(`var APP_URL = ${JSON.stringify(server.url)};`));
});

async function install(store: string, scopes: string[]): Promise<void> {
  const { callbackUrl } = platform.hub.install(APP_ID, { store, scopes });
  const response = await fetch(callbackUrl, { redirect: 'manual' });
  assert.ok(response.status < 400, `install on ${store} answered ${response.status}`);
}

async function chat(
  store: string,
  message: string,
  customerId?: number
): Promise<{
  text: string;
  products?: { id: string; slug: string; title: string; price: number }[];
  orders?: { total: string }[];
  suggestions?: string[];
}> {
  const token = platform.hub.shopperToken({ appId: APP_ID, store, customerId });
  const response = await fetch(`${server.url}/api/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

async function freePort(): Promise<number> {
  const probe = net.createServer().listen(0);
  await new Promise((resolve) => probe.once('listening', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
