import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  ExampleDashboard,
  FakeStore,
  escapeHtml,
  readBody,
  sendHtml,
  serve,
  startFakePlatform,
} from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from './server.js';

const PORTS = { app: 4000, hub: 4001, store: 4002, dashboard: 4003, simulate: 4004 };
const STORE = 'demo.flycom.shop';
const SCOPES = ['orders.read', 'orders.write', 'webhooks.manage'];
const DATA_FILE = 'data/dev.json';
const CREDENTIALS_FILE = 'data/dev-credentials.json';
const appUrl = `http://localhost:${PORTS.app}`;
const { appId, dashboard } = loadAppConfig('app-config.json');

// The emulator keeps everything in memory, so the app starts from nothing too.
for (const file of [DATA_FILE, CREDENTIALS_FILE]) fs.rmSync(file, { force: true });

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

const app = createApp({
  ...platform.env,
  APP_URL: appUrl,
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  DATA_FILE,
  CREDENTIALS_FILE,
  FRAME_ANCESTORS: `http://127.0.0.1:${PORTS.dashboard}`,
});
const server = await startServer(app, PORTS.app);

// The merchant approves the install in the app store, and FlyCommerce sends them to the app's install URL.
const { callbackUrl } = platform.hub.install(appId, { store: STORE, scopes: SCOPES });
await fetch(callbackUrl, { redirect: 'manual' });

const dashboardServer = await ExampleDashboard.start({
  hub: platform.hub,
  appId,
  appName: 'Order Review',
  appUrl,
  store: STORE,
  pages: dashboard.pages,
  port: PORTS.dashboard,
});

const placeOrder = async (total: number) => {
  const order = store.addOrder({ total });
  const [delivery] = await platform.store.deliver(STORE, 'order.created', FakeStore.rawOrder(order));
  const answer = delivery?.status ?? 'nothing: no active subscription';
  return `Order #${order.orderNo} for ${total} placed; order.created answered ${answer}.`;
};

const actions: Record<string, { label: string; hint: string; run: () => Promise<string> }> = {
  order: {
    label: 'Place an order',
    hint: 'Under the limit: it never reaches the queue.',
    run: () => placeOrder(49),
  },
  big: {
    label: 'Place a big order',
    hint: 'Over the limit: it lands in the Review queue.',
    run: () => placeOrder(1499),
  },
};

const simulate = await serve(async (req, res) => {
  const form = req.method === 'POST' ? new URLSearchParams(await readBody(req)) : null;
  const action = actions[form?.get('name') ?? ''];
  sendHtml(res, 200, simulatePage(action ? await action.run() : ''));
}, PORTS.simulate);

console.log(`
  Order Review is running for ${STORE}.

  Dashboard   ${dashboardServer.url}/apps/queue
  Simulate    ${simulate.url}
`);

process.on('SIGINT', async () => {
  await Promise.all([simulate.close(), dashboardServer.close(), server.close()]);
  await platform.close();
  process.exit(0);
});

function simulatePage(result: string): string {
  const queue = `${dashboardServer.url}/apps/queue`;
  const buttons = Object.entries(actions).map(
    ([name, { label, hint }]) =>
      `<form method="post"><button name="name" value="${name}">${label}</button> ${hint}</form>`
  );

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Simulate</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px}form{padding:10px 0;border-top:1px solid #e6e8ef}button{font:inherit;width:170px;padding:6px 10px;margin-right:12px}output{display:block;padding:10px;background:#eaf1ff;border-radius:6px}</style></head>
<body><h1>Simulate the store</h1><p>Watch the <a href="${queue}" target="_blank">Review queue</a>.</p>
${result ? `<output>${escapeHtml(result)}</output>` : ''}${buttons.join('')}</body></html>`;
}
