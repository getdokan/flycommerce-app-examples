import assert from 'node:assert/strict';
import net, { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { type FakePlatform, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;
const STORE = 'demo.flycom.shop';

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
  server = await startServer(createApp(platform.env), port);
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

function asOwner(pathname: string, send?: { method: string; body: unknown }): Promise<Response> {
  const token = platform.hub.sessionToken({ appId: APP_ID, store: STORE, userId: '1', role: 'owner' });

  return fetch(`${server.url}${pathname}`, {
    method: send?.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: send && JSON.stringify(send.body),
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
