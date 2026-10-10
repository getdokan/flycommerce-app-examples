import crypto from 'node:crypto';
import fs from 'node:fs';
import { ExampleDashboard, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from './server.js';

const PORTS = { app: 4000, hub: 4001, store: 4002, dashboard: 4003 };
const STORE = 'teahouse.flycom.shop';
const CUSTOMER = 1001;
const CREDENTIALS_FILE = 'data/dev-credentials.json';
const DAY = 24 * 60 * 60 * 1000;
const appUrl = `http://localhost:${PORTS.app}`;
const { appId, storefront } = loadAppConfig('app-config.json');

// The emulator keeps everything in memory, so the app starts from nothing too.
fs.rmSync(CREDENTIALS_FILE, { force: true });

const platform = await startFakePlatform(
  { appId, appSecret: crypto.randomBytes(24).toString('hex'), redirectUri: `${appUrl}/auth/callback` },
  PORTS
);

const store = platform.store.store(STORE);
store.addProduct({ title: 'Darjeeling green tea', price: 14, description: 'Loose leaf green tea, 100 g' });
store.addProduct({ title: 'Jasmine green tea bags', price: 6, description: '20 bags of green tea with jasmine' });
store.addProduct({ title: 'Assam black tea', price: 9, description: 'Strong breakfast tea, loose leaf' });
store.addProduct({ title: 'Stoneware mug', price: 12, description: 'Holds 350 ml of tea or coffee' });
store.addProduct({ title: 'Glass teapot', price: 24, description: 'With a steel infuser for loose leaf tea' });
store.addOrder({
  customerId: CUSTOMER,
  firstName: 'Nadia',
  total: 26,
  status: 'completed',
  createdAt: new Date(Date.now() - 9 * DAY).toISOString(),
});
store.addOrder({
  customerId: CUSTOMER,
  firstName: 'Nadia',
  total: 14,
  status: 'processing',
  createdAt: new Date(Date.now() - DAY).toISOString(),
});
store.addOrder({ customerId: 2002, firstName: 'Sam', total: 99 });

const app = createApp({
  ...platform.env,
  APP_URL: appUrl,
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  CREDENTIALS_FILE,
});
const server = await startServer(app, PORTS.app);

// The merchant installs the app and grants what it asks for, the customer's id included.
const { callbackUrl } = platform.hub.install(appId, {
  store: STORE,
  scopes: ['catalog.read', 'orders.read', 'storefront.scripts', 'storefront.customer'],
});
await fetch(callbackUrl, { redirect: 'manual' });

const dashboard = await ExampleDashboard.start({
  hub: platform.hub,
  appId,
  appName: 'Shopping Assistant',
  appUrl,
  store: STORE,
  pages: [],
  scripts: storefront?.scripts,
  products: store.productList,
  customerId: CUSTOMER,
  port: PORTS.dashboard,
});

console.log(`
  Shopping Assistant is running for ${STORE}.

  Storefront  ${dashboard.url}/storefront
  Switch "Shopper" to signed in to ask about orders.
`);

process.on('SIGINT', async () => {
  await Promise.all([dashboard.close(), server.close()]);
  await platform.close();
  process.exit(0);
});
