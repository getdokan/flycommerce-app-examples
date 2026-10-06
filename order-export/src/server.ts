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
import { exportOrders } from './export.js';
import { install } from './install.js';

export interface App {
  config: AppServerConfig;
  appConfig: AppConfig;
  hub: HubClient;
  store: StoreApi;
}

export type Route = (app: App, req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

const routes: Record<string, Route> = {
  'GET /auth/callback': install,
  'GET /api/export': exportOrders,
};

export function createApp(env: NodeJS.ProcessEnv = process.env): App {
  const sealer = new Sealer(required(env, 'ENCRYPTION_KEY'));
  const credentials = new FileCredentialStore(env.CREDENTIALS_FILE ?? 'data/credentials.json', { sealer });
  const config = { ...appServerConfigFromEnv(env), credentials };
  const hub = new HubClient(config);

  return {
    config,
    appConfig: loadAppConfig('app-config.json', { appId: config.appId }),
    hub,
    store: new StoreApi(config, hub),
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
      sendError(res, error, 'order-export');
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
  const server = await startServer(createApp(), Number(process.env.PORT ?? 4000));
  console.log(`Order Export is listening on ${server.url}`);
}
