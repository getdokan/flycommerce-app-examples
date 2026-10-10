import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type AppServerConfig,
  FileCredentialStore,
  HubClient,
  Sealer,
  StoreApi,
  appServerConfigFromEnv,
  json,
  loadEnvFile,
  required,
  sendError,
} from '@flycommerce/app-server';
import { chat } from './chat.js';
import { install } from './install.js';
import { assistantScript } from './storefront.js';

export interface App {
  config: AppServerConfig;
  hub: HubClient;
  store: StoreApi;
}

export type Route = (app: App, req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

const routes: Record<string, Route> = {
  'GET /auth/callback': install,
  'POST /api/chat': chat,
  'OPTIONS /api/chat': chat,
  'GET /storefront/assistant.js': assistantScript,
};

export function createApp(env: NodeJS.ProcessEnv = process.env): App {
  const sealer = new Sealer(required(env, 'ENCRYPTION_KEY'));
  const credentials = new FileCredentialStore(env.CREDENTIALS_FILE ?? 'data/credentials.json', { sealer });
  const config = { ...appServerConfigFromEnv(env), credentials };
  const hub = new HubClient(config);

  return { config, hub, store: new StoreApi(config, hub) };
}

export async function startServer(app: App, port: number): Promise<{ url: string; close(): Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) return await route(app, req, res, url);

      json(res, 404, { error: 'not_found' });
    } catch (error) {
      sendError(res, error, 'shopping-assistant');
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
  console.log(`Shopping Assistant is listening on ${server.url}`);
}
