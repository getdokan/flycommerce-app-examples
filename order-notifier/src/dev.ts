import crypto from 'node:crypto';
import fs from 'node:fs';
import { ExampleDashboard, FakeStore, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from './server.js';

const PORTS = { app: 4004, hub: 4005, store: 4006, dashboard: 4007 };
const STORE = 'demo.flycom.shop';
const CREDENTIALS_FILE = 'data/dev-credentials.json';
const DATA_FILE = 'data/dev-order-notifier.json';
const appUrl = `http://localhost:${PORTS.app}`;
const { appId, dashboard } = loadAppConfig('app-config.json');

// The emulator keeps everything in memory, so the app starts from nothing too.
fs.rmSync(CREDENTIALS_FILE, { force: true });
fs.rmSync(DATA_FILE, { force: true });

const platform = await startFakePlatform(
  { appId, appSecret: crypto.randomBytes(24).toString('hex'), redirectUri: `${appUrl}/auth/callback` },
  PORTS
);

const app = createApp({
  ...platform.env,
  APP_URL: appUrl,
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  CREDENTIALS_FILE,
  DATA_FILE,
  FRAME_ANCESTORS: `http://127.0.0.1:${PORTS.dashboard}`,
});
const server = await startServer(app, PORTS.app);

// The merchant approves the install in the app store, and FlyCommerce sends them to the app's install URL.
const { callbackUrl } = platform.hub.install(appId, { store: STORE, scopes: ['orders.read', 'webhooks.manage'] });
await fetch(callbackUrl, { redirect: 'manual' });

const dashboardServer = await ExampleDashboard.start({
  hub: platform.hub,
  appId,
  appName: 'Order Notifier',
  appUrl,
  store: STORE,
  pages: dashboard.pages,
  port: PORTS.dashboard,
});

console.log(`
  Order Notifier is running for ${STORE}.

  Dashboard   ${dashboardServer.url}/apps/settings

  Save a real bot token and chat ID there, then press Enter here to place an order.
`);

const customers = [
  { firstName: 'Nadia', lastName: 'Rahman', total: 120 },
  { firstName: 'Tom & <Jerry>', lastName: 'Test', total: 18.5 },
];
let placed = 0;

process.stdin.on('data', async () => {
  const order = platform.store.store(STORE).addOrder(customers[placed++ % customers.length]);
  const [delivery] = await platform.store.deliver(STORE, 'order.created', FakeStore.rawOrder(order));
  console.log(`  Order #${order.orderNo} placed: the app answered ${delivery?.status ?? 'nothing (not subscribed)'}.`);
});

process.on('SIGINT', async () => {
  await Promise.all([dashboardServer.close(), server.close()]);
  await platform.close();
  process.exit(0);
});
