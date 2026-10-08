import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ExampleDashboard, type FakePlatform, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from '../src/server.js';

const config = loadAppConfig('app-config.json');
const scripts = config.storefront?.scripts ?? [];

let platform: FakePlatform;
let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'order-export-storefront-'));

  platform = await startFakePlatform({
    appId: config.appId,
    appSecret: 'test-secret',
    redirectUri: 'http://localhost:1/auth/callback',
  });
  server = await startServer(
    createApp({
      ...platform.env,
      ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
      CREDENTIALS_FILE: path.join(folder, 'credentials.json'),
      DATA_FILE: path.join(folder, 'order-export.json'),
    }),
    0
  );
});

after(async () => {
  await server.close();
  await platform.close();
});

test('declares the welcome script on its own host', () => {
  assert.deepEqual(
    scripts.map((script) => script.handle),
    ['welcome']
  );
  assert.equal(new URL(scripts[0].src).host, new URL(config.appUrl).host);
});

test('serves the declared script as JavaScript', async () => {
  const response = await fetch(`${server.url}${new URL(scripts[0].src).pathname}`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), fs.readFileSync('storefront/welcome.js', 'utf8'));
});

test("runs on the emulator's example storefront", async () => {
  const dashboard = await ExampleDashboard.start({
    hub: platform.hub,
    appId: config.appId,
    appName: 'Order Export',
    appUrl: config.appUrl,
    store: 'demo.flycom.shop',
    pages: config.dashboard.pages,
    scripts,
  });

  try {
    const page = await (await fetch(`${dashboard.url}/storefront`)).text();
    assert.ok(page.includes(scripts[0].src));
  } finally {
    await dashboard.close();
  }
});
