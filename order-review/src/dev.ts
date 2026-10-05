import crypto from 'node:crypto';
import { ExampleDashboard, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from './server.js';

const PORTS = { app: 4000, hub: 4001, store: 4002, dashboard: 4003 };
const STORE = 'demo.flycom.shop';
const SCOPES = ['orders.read', 'orders.write', 'webhooks.manage'];
const appUrl = `http://localhost:${PORTS.app}`;
const { appId, dashboard } = loadAppConfig('app-config.json');

const registration = {
  appId,
  appSecret: crypto.randomBytes(24).toString('hex'),
  redirectUri: `${appUrl}/auth/callback`,
};
const platform = await startFakePlatform(registration, PORTS);
const store = platform.store.store(STORE);

// Orders from before the app was installed.
for (const total of [42, 1250, 89.5, 640, 15]) {
  store.addOrder({ total, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() });
}

// The merchant approves the install, so the store lets the app act for its users.
platform.hub.install(appId, { store: STORE, scopes: SCOPES });

const app = createApp({ ...platform.env, FRAME_ANCESTORS: `http://127.0.0.1:${PORTS.dashboard}` });
const server = await startServer(app, PORTS.app);

const dashboardServer = await ExampleDashboard.start({
  hub: platform.hub,
  appId,
  appName: 'Order Review',
  appUrl,
  store: STORE,
  pages: dashboard.pages,
  port: PORTS.dashboard,
});

console.log(`
  Order Review is running for ${STORE}.

  Dashboard   ${dashboardServer.url}/apps/queue
`);

process.on('SIGINT', async () => {
  await Promise.all([dashboardServer.close(), server.close()]);
  await platform.close();
  process.exit(0);
});
