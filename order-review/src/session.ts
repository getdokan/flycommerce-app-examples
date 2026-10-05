import type { IncomingMessage } from 'node:http';
import { type DashboardSession, authenticate, json } from '@flycommerce/app-server';
import type { Route, App } from './server.js';

// FlyCommerce: verify the session token, then trust only its store — https://developers.flycommerce.com/docs/apps
export async function whoIsAsking(app: App, req: IncomingMessage): Promise<DashboardSession> {
  return authenticate(req, app.config);
}

export const showMe: Route = async (app, req, res) => {
  const { store, session } = await whoIsAsking(app, req);
  json(res, 200, { store, userId: session.sub, role: session.user_role });
};
