import crypto from 'node:crypto';
import fs from 'node:fs';
import { ExampleDashboard, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from './server.js';

const PORTS = { app: 4000, hub: 4001, store: 4002, dashboard: 4003 };
const STORE = 'demo.flycom.shop';
const CREDENTIALS_FILE = 'data/dev-credentials.json';
const DATA_FILE = 'data/dev-order-export.json';
const DAY = 24 * 60 * 60 * 1000;
const appUrl = `http://localhost:${PORTS.app}`;
const { appId, dashboard, storefront } = loadAppConfig('app-config.json');

// The emulator keeps everything in memory, so the app starts from nothing too.
fs.rmSync(CREDENTIALS_FILE, { force: true });
fs.rmSync(DATA_FILE, { force: true });

const platform = await startFakePlatform(
  { appId, appSecret: crypto.randomBytes(24).toString('hex'), redirectUri: `${appUrl}/auth/callback` },
  PORTS
);

// A month of orders, including names a CSV has to be careful with.
const customers = [
  { firstName: 'Nadia', lastName: 'Rahman' },
  { firstName: 'Zoë', lastName: 'Laurent' },
  { firstName: 'Sam', lastName: 'O"Neil, Jr' },
  { firstName: '=HYPERLINK("https://example.test")', lastName: 'Test' },
];
const store = platform.store.store(STORE);
for (let daysAgo = 30; daysAgo >= 0; daysAgo -= 2) {
  store.addOrder({
    ...customers[daysAgo % customers.length],
    total: 20 + ((daysAgo * 37) % 400),
    createdAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
  });
}

const app = createApp({
  ...platform.env,
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  CREDENTIALS_FILE,
  DATA_FILE,
  FRAME_ANCESTORS: `http://127.0.0.1:${PORTS.dashboard}`,
});
const server = await startServer(app, PORTS.app);

// The merchant approves the install in the app store, and FlyCommerce sends them to the app's install URL.
const { callbackUrl } = platform.hub.install(appId, { store: STORE, scopes: ['orders.read'] });
await fetch(callbackUrl, { redirect: 'manual' });

const dashboardServer = await ExampleDashboard.start({
  hub: platform.hub,
  appId,
  appName: 'Order Export',
  appUrl,
  store: STORE,
  pages: dashboard.pages,
  scripts: storefront?.scripts,
  port: PORTS.dashboard,
});

console.log(`
  Order Export is running for ${STORE}.

  Dashboard   ${dashboardServer.url}/apps/export
  Storefront  ${dashboardServer.url}/storefront
`);

process.on('SIGINT', async () => {
  await Promise.all([dashboardServer.close(), server.close()]);
  await platform.close();
  process.exit(0);
});
