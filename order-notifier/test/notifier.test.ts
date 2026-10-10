import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { type FakePlatform, FakeStore, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig, readRawBody } from '@flycommerce/app-server';
import { type App, createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;
const STORE = 'demo.flycom.shop';
const OTHER_STORE = 'other.flycom.shop';
const BOT_TOKEN = '123456:SECRET-BOT-TOKEN';
const CHAT_ID = '987654321';

let platform: FakePlatform;
let app: App;
let server: Awaited<ReturnType<typeof startServer>>;
let telegram: http.Server;
let dataFile: string;
let sent: { botToken: string; body: Record<string, unknown> }[] = [];
let telegramRefuses = false;

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

function ownerToken(store: string): string {
  return platform.hub.sessionToken({ appId: APP_ID, store, userId: '1', role: 'owner' });
}

function install(store: string): Promise<Response> {
  const { callbackUrl } = platform.hub.install(APP_ID, { store, scopes: ['orders.read', 'webhooks.manage'] });
  return fetch(callbackUrl, { redirect: 'manual' });
}

function call(store: string, route: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  return fetch(`${server.url}${route}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken(store)}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function saveSettings(store: string, overrides: Record<string, unknown> = {}): Promise<Response> {
  const body = { enabled: true, botToken: BOT_TOKEN, chatId: CHAT_ID, minOrderValue: 0, includeCustomerInfo: true };
  return call(store, '/api/settings', { method: 'PUT', body: { ...body, ...overrides } });
}

/** Places an order on the emulator's store, which delivers `order.created` the way a real store does. */
async function placeOrder(overrides: Parameters<ReturnType<FakeStore['store']>['addOrder']>[0] = {}) {
  const order = platform.store.store(STORE).addOrder(overrides);
  const [delivery] = await platform.store.deliver(STORE, 'order.created', FakeStore.rawOrder(order));
  return { order, delivery };
}

before(async () => {
  const port = await freePort();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'order-notifier-test-'));
  dataFile = path.join(folder, 'notifier.json');

  telegram = http.createServer(async (req, res) => {
    const match = req.url?.match(/^\/bot([^/]+)\/sendMessage$/);
    if (!match) return void res.writeHead(404).end();

    sent.push({ botToken: match[1], body: JSON.parse(await readRawBody(req)) });
    res.writeHead(telegramRefuses ? 400 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(telegramRefuses ? { ok: false, description: 'Bad Request: chat not found' } : { ok: true }));
  });
  await new Promise<void>((resolve) => telegram.listen(0, resolve));

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-app-secret',
    redirectUri: `http://localhost:${port}/auth/callback`,
  });

  app = createApp({
    ...platform.env,
    APP_URL: `http://localhost:${port}`,
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    CREDENTIALS_FILE: path.join(folder, 'credentials.json'),
    DATA_FILE: dataFile,
    TELEGRAM_API_URL: `http://localhost:${(telegram.address() as AddressInfo).port}`,
  });
  server = await startServer(app, port);
});

after(async () => {
  await server.close();
  await platform.close();
  await new Promise<void>((resolve) => telegram.close(() => resolve()));
});

beforeEach(() => {
  sent = [];
  telegramRefuses = false;
});

test('serves its settings page for the dashboard to frame', async () => {
  const response = await fetch(`${server.url}/settings`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /^frame-ancestors /);
  assert.ok(html.includes(`<meta name="flycom-app-id" content="${APP_ID}">`));
});

test('install keeps the credential and subscribes the store to new orders', async () => {
  const response = await install(STORE);

  assert.equal(response.status, 200);
  assert.ok(app.config.credentials.get(STORE));

  const subscriptions = platform.store.store(STORE).webhookList;
  assert.equal(subscriptions.length, 1);
  assert.deepEqual(subscriptions[0].events, ['order.created']);
  assert.equal(subscriptions[0].endpoint, `${server.url}/webhooks/orders?store=${STORE}`);
});

test('refuses settings requests without a valid session token', async () => {
  const response = await fetch(`${server.url}/api/settings`);
  assert.equal(response.status, 401);
});

test('never sends the bot token back, and seals it and the webhook secret on disk', async () => {
  const saved = await saveSettings(STORE, { minOrderValue: 50 });
  const savedText = await saved.text();
  const shown = await call(STORE, '/api/settings');
  const shownText = await shown.text();

  assert.equal(saved.status, 200);
  assert.equal(shown.status, 200);
  assert.ok(!savedText.includes('SECRET-BOT-TOKEN'), 'the save answer must not echo the token');
  assert.ok(!shownText.includes('SECRET-BOT-TOKEN'), 'the settings answer must not reveal the token');
  assert.equal(JSON.parse(shownText).botTokenSet, true);
  assert.equal(JSON.parse(shownText).chatId, CHAT_ID);

  const disk = fs.readFileSync(dataFile, 'utf8');
  assert.ok(!disk.includes('SECRET-BOT-TOKEN'));
  assert.ok(!disk.includes(platform.store.store(STORE).webhookList[0].secret));
});

test('keeps the saved bot token when the form leaves it blank', async () => {
  await saveSettings(STORE, { botToken: '', chatId: '111' });
  const response = await call(STORE, '/api/test-alert', { method: 'POST' });

  assert.equal(response.status, 200);
  assert.equal(sent[0].botToken, BOT_TOKEN);
  assert.equal(sent[0].body.chat_id, '111');
});

test('sends a test alert with the saved bot and chat', async () => {
  await saveSettings(STORE);
  const response = await call(STORE, '/api/test-alert', { method: 'POST' });

  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].botToken, BOT_TOKEN);
  assert.equal(sent[0].body.chat_id, CHAT_ID);
  assert.match(String(sent[0].body.text), /Test alert/);
});

test("keeps each store's settings to itself", async () => {
  await install(OTHER_STORE);
  const response = await call(OTHER_STORE, '/api/settings');
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(body.store, OTHER_STORE);
  assert.equal(body.botTokenSet, false);
  assert.equal(body.chatId, '');
});

test('saving turns alerts on for a store that lost its subscription', async () => {
  const store = 'third.flycom.shop';
  await install(store);
  platform.store.store(store).webhookList.length = 0;
  const disk = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  delete disk[store];
  fs.writeFileSync(dataFile, JSON.stringify(disk));

  const saved = await saveSettings(store);

  assert.equal(saved.status, 200);
  assert.deepEqual(platform.store.store(store).webhookList[0]?.events, ['order.created']);
  assert.ok(app.data.webhookSecret(store));
});

test('refuses a delivery with a missing or wrong signature', async () => {
  const body = JSON.stringify({ event: 'order.created', timestamp: new Date().toISOString(), data: { id: 'x' } });
  const forged = crypto.createHmac('sha256', 'not-the-secret').update(body).digest('hex');

  for (const headers of [{}, { 'X-Webhook-Signature': forged }]) {
    const response = await fetch(`${server.url}/webhooks/orders?store=${STORE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    });
    assert.equal(response.status, 401);
  }
  assert.equal(sent.length, 0);
});

test('alerts on a new order the store delivers, with the order as the API shapes it', async () => {
  await saveSettings(STORE);
  const { order, delivery } = await placeOrder({
    firstName: 'Sarah',
    lastName: 'Connor',
    total: 129.99,
    currency: 'EUR',
  });

  assert.equal(delivery.status, 200);
  assert.equal(sent.length, 1);
  const text = String(sent[0].body.text);
  assert.match(text, new RegExp(`#${order.orderNo}\\b`));
  assert.match(text, /129\.99 EUR/);
  assert.match(text, /Sarah Connor/);
  assert.match(text, new RegExp(order.orderGroup.customerInfo.email));
});

test("escapes the customer's name so Telegram can't read it as markup", async () => {
  await saveSettings(STORE);
  await placeOrder({ firstName: 'Tom & <b>Jerry</b>', lastName: '<a href="https://x.test">' });

  const text = String(sent[0].body.text);
  assert.ok(text.includes('Tom &amp; &lt;b&gt;Jerry&lt;/b&gt; &lt;a href="https://x.test"&gt;'), text);
  assert.ok(!text.includes('<b>Jerry'));
});

test('leaves the customer out when the merchant asks', async () => {
  await saveSettings(STORE, { includeCustomerInfo: false });
  const { order } = await placeOrder({ firstName: 'Sarah', lastName: 'Connor' });

  const text = String(sent[0].body.text);
  assert.ok(!text.includes('Sarah'));
  assert.ok(!text.includes(order.orderGroup.customerInfo.email));
});

test('skips an order below the minimum total', async () => {
  await saveSettings(STORE, { minOrderValue: 50 });
  const { delivery } = await placeOrder({ total: 25 });

  assert.equal(delivery.status, 200);
  assert.equal(sent.length, 0);
});

test('skips every order while alerts are off', async () => {
  await saveSettings(STORE, { enabled: false });
  const { delivery } = await placeOrder({ total: 200 });

  assert.equal(delivery.status, 200);
  assert.equal(sent.length, 0);
});

test('does not claim delivery when Telegram refuses the alert', async () => {
  await saveSettings(STORE);
  telegramRefuses = true;
  const order = platform.store.store(STORE).addOrder();
  const body = JSON.stringify({
    event: 'order.created',
    timestamp: new Date().toISOString(),
    data: FakeStore.rawOrder(order),
  });
  const secret = platform.store.store(STORE).webhookList[0].secret;

  const response = await fetch(`${server.url}/webhooks/orders?store=${STORE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': crypto.createHmac('sha256', secret).update(body).digest('hex'),
    },
    body,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { delivered: false });
});
