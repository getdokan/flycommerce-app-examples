import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { type FakePlatform, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig, readRawBody } from '@flycommerce/app-server';
import { type App, createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;
const STORE = 'demo.flycom.shop';
const WEBHOOK_SECRET = 'super-secret-webhook-signing-key-123';

let platform: FakePlatform;
let app: App;
let server: Awaited<ReturnType<typeof startServer>>;
let telegramMock: http.Server;
let telegramUrl: string;
let dataFile: string;
let lastTelegramMessage: { botToken: string; body: Record<string, unknown> } | null = null;

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

before(async () => {
  const port = await freePort();
  const telegramPort = await freePort();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'order-notifier-test-'));
  dataFile = path.join(folder, 'notifier.json');

  telegramMock = http.createServer(async (req, res) => {
    const match = req.url?.match(/^\/bot([^/]+)\/sendMessage/);
    if (match) {
      const raw = await readRawBody(req);
      lastTelegramMessage = { botToken: match[1], body: JSON.parse(raw) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: 1234 } }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => telegramMock.listen(telegramPort, resolve));
  telegramUrl = `http://localhost:${telegramPort}`;
  process.env.TELEGRAM_API_URL = telegramUrl;

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-app-secret-123',
    redirectUri: `http://localhost:${port}/auth/callback`,
  });

  app = createApp({
    ...platform.env,
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    CREDENTIALS_FILE: path.join(folder, 'credentials.json'),
    DATA_FILE: dataFile,
    TELEGRAM_API_URL: telegramUrl,
  });

  server = await startServer(app, port);
});

after(async () => {
  await server.close();
  await platform.close();
  await new Promise<void>((resolve) => telegramMock.close(() => resolve()));
});

beforeEach(() => {
  lastTelegramMessage = null;
});

test('serves its settings page for the dashboard to frame', async () => {
  const response = await fetch(`${server.url}/settings`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /^frame-ancestors /);
  assert.ok(html.includes(`<meta name="flycom-app-id" content="${APP_ID}">`));
});

test('installs: saves credentials and handles installation', async () => {
  const { callbackUrl } = platform.hub.install(APP_ID, { store: STORE, scopes: ['orders.read', 'webhooks.manage'] });
  const response = await fetch(callbackUrl, { redirect: 'manual' });

  assert.equal(response.status, 200);
  assert.ok(app.config.credentials.get(STORE));
});

test('refuses settings requests without a valid session token', async () => {
  const response = await fetch(`${server.url}/api/settings`);
  assert.equal(response.status, 401);
});

test('saves settings and seals bot token at rest on disk', async () => {
  const response = await fetch(`${server.url}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken(STORE)}`,
    },
    body: JSON.stringify({
      enabled: true,
      botToken: '123456:SECRET-BOT-TOKEN',
      chatId: '987654321',
      minOrderValue: 50,
      includeCustomerInfo: true,
    }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.enabled, true);
  assert.equal(body.chatId, '987654321');

  // Verify encryption at rest in disk file
  const rawDisk = fs.readFileSync(dataFile, 'utf8');
  assert.ok(!rawDisk.includes('SECRET-BOT-TOKEN'), 'Plaintext bot token must NOT appear on disk');
  assert.ok(rawDisk.includes('sealedBotToken'), 'Sealed bot token must be stored on disk');
});

test('sends a test alert to Telegram mock server', async () => {
  const response = await fetch(`${server.url}/api/test-alert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken(STORE)}` },
  });

  assert.equal(response.status, 200);
  assert.ok(lastTelegramMessage);
  assert.equal(lastTelegramMessage.botToken, '123456:SECRET-BOT-TOKEN');
  assert.equal(lastTelegramMessage.body.chat_id, '987654321');
  assert.match(String(lastTelegramMessage.body.text), /Test Notification/);
});

test('refuses webhooks with missing or invalid signature', async () => {
  const response = await fetch(`${server.url}/webhooks/orders?store=${STORE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'orders.create', data: {} }),
  });

  assert.equal(response.status, 401);
});

test('processes valid orders.create webhook and dispatches alert', async () => {
  app.data.setSettings(STORE, {
    enabled: true,
    botToken: '123456:SECRET-BOT-TOKEN',
    chatId: '987654321',
    minOrderValue: 0,
    includeCustomerInfo: true,
  });
  app.data.setWebhookSecret(STORE, WEBHOOK_SECRET);

  const payload = JSON.stringify({
    event: 'orders.create',
    timestamp: new Date().toISOString(),
    data: {
      orderNo: 1042,
      total: 129.99,
      status: 'paid',
      orderGroup: {
        currency: 'USD',
        customerInfo: { firstName: 'Sarah', lastName: 'Connor', email: 'sarah@example.com' },
      },
    },
  });

  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

  const response = await fetch(`${server.url}/webhooks/orders?store=${STORE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
    },
    body: payload,
  });

  assert.equal(response.status, 200);
  const result = (await response.json()) as Record<string, unknown>;
  assert.equal(result.delivered, true);

  assert.ok(lastTelegramMessage);
  assert.match(String(lastTelegramMessage.body.text), /#1042/);
  assert.match(String(lastTelegramMessage.body.text), /129.99 USD/);
  assert.match(String(lastTelegramMessage.body.text), /Sarah Connor/);
});

test('skips notification when order is below minimum threshold', async () => {
  app.data.setSettings(STORE, {
    enabled: true,
    botToken: '123456:SECRET-BOT-TOKEN',
    chatId: '987654321',
    minOrderValue: 50,
    includeCustomerInfo: true,
  });
  app.data.setWebhookSecret(STORE, WEBHOOK_SECRET);

  const payload = JSON.stringify({
    event: 'orders.create',
    timestamp: new Date().toISOString(),
    data: {
      orderNo: 1043,
      total: 25.0, // Below threshold of 50
      status: 'paid',
    },
  });

  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

  const response = await fetch(`${server.url}/webhooks/orders?store=${STORE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
    },
    body: payload,
  });

  assert.equal(response.status, 200);
  const result = (await response.json()) as Record<string, unknown>;
  assert.equal(result.skipped, 'below_threshold');
  assert.equal(lastTelegramMessage, null);
});

test('skips notification when notifications are disabled', async () => {
  app.data.setSettings(STORE, {
    enabled: false,
    botToken: '123456:SECRET-BOT-TOKEN',
    chatId: '987654321',
    minOrderValue: 0,
    includeCustomerInfo: true,
  });

  const payload = JSON.stringify({
    event: 'orders.create',
    timestamp: new Date().toISOString(),
    data: { orderNo: 1044, total: 200 },
  });

  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

  const response = await fetch(`${server.url}/webhooks/orders?store=${STORE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
    },
    body: payload,
  });

  assert.equal(response.status, 200);
  const result = (await response.json()) as Record<string, unknown>;
  assert.equal(result.skipped, 'notifications_disabled');
  assert.equal(lastTelegramMessage, null);
});
