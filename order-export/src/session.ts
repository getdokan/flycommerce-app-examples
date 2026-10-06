import type { IncomingMessage } from 'node:http';
import { type DashboardSession, HttpError, authenticate } from '@flycommerce/app-server';
import type { App } from './server.js';

// FlyCommerce: verify the session token, then trust only its store — https://developers.flycommerce.com/docs/apps
export async function whoIsAsking(app: App, req: IncomingMessage): Promise<DashboardSession> {
  const asking = await authenticate(req, app.config);

  if (!app.config.credentials.get(asking.store)) {
    throw new HttpError(403, 'not_installed', 'Order Export is not installed on this store.');
  }

  return asking;
}
