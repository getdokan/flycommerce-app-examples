import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type AppConfig,
  type AppServerConfig,
  FileCredentialStore,
  HubClient,
  Sealer,
  StoreApi,
  appServerConfigFromEnv,
  json,
  loadAppConfig,
  loadEnvFile,
  required,
  sendError,
  serveWebApp,
} from '@flycommerce/app-server';
import { catchUpEveryHour } from './catch-up.js';
import { Data } from './data.js';
import { install } from './install.js';
import { hold, release, showQueue } from './orders.js';
import { showMe } from './session.js';
import { saveSettings, showSettings } from './settings.js';
import { orderCreated } from './webhooks.js';

export interface App {
  config: AppServerConfig;
  appConfig: AppConfig;
  /** Where this app is reachable; the store sends webhooks here. */
  url: string;
  hub: HubClient;
  store: StoreApi;
  data: Data;
}

export type Route = (app: App, req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

const routes: Record<string, Route> = {
  'GET /auth/callback': install,
  'POST /webhooks/order-created': orderCreated,
  'GET /api/me': showMe,
  'GET /api/queue': showQueue,
  'POST /api/queue/hold': hold,
  'POST /api/queue/release': release,
  'GET /api/settings': showSettings,
  'PUT /api/settings': saveSettings,
};

export function createApp(env: NodeJS.ProcessEnv = process.env): App {
  const sealer = new Sealer(required(env, 'ENCRYPTION_KEY'));
  const credentials = new FileCredentialStore(env.CREDENTIALS_FILE ?? 'data/credentials.json', { sealer });
  const config = { ...appServerConfigFromEnv(env), credentials };
  const hub = new HubClient(config);

  return {
    config,
    appConfig: loadAppConfig('app-config.json', { appId: config.appId }),
    url: required(env, 'APP_URL'),
    hub,
    store: new StoreApi(config, hub),
    data: new Data(env.DATA_FILE ?? 'data/order-review.json', sealer),
  };
}

export async function startServer(app: App, port: number): Promise<{ url: string; close(): Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) return await route(app, req, res, url);

      const page = {
        root: 'dist/pages',
        appId: app.config.appId,
        config: app.appConfig,
        frameAncestors: app.config.frameAncestors,
      };
      if (await serveWebApp(req.method, url.pathname, res, page)) return;

      json(res, 404, { error: 'not_found' });
    } catch (error) {
      sendError(res, error, 'order-review');
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.filename === process.argv[1]) {
  loadEnvFile();
  const app = createApp();
  const server = await startServer(app, Number(process.env.PORT ?? 4000));
  catchUpEveryHour(app);
  console.log(`Order Review is listening on ${server.url}`);
}
