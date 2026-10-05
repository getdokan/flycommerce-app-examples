import type { IncomingMessage } from 'node:http';
import { type DashboardSession, HttpError, authenticate, json } from '@flycommerce/app-server';
import type { Route, App } from './server.js';

// FlyCommerce: verify the session token, then trust only its store — https://developers.flycommerce.com/docs/apps
export async function whoIsAsking(app: App, req: IncomingMessage): Promise<DashboardSession> {
  const asking = await authenticate(req, app.config);

  if (!app.config.credentials.get(asking.store)) {
    throw new HttpError(403, 'not_installed', 'Order Review is not installed on this store.');
  }

  return asking;
}

export const showMe: Route = async (app, req, res) => {
  const { store, session } = await whoIsAsking(app, req);
  json(res, 200, { store, userId: session.sub, role: session.user_role });
};
