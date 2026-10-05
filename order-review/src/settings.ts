import { HttpError, json, readJson } from '@flycommerce/app-server';
import type { StoreOrder } from './orders.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';

const ROLES_THAT_CHANGE_SETTINGS = ['owner', 'admin'];

export const showSettings: Route = async (app, req, res) => {
  const asking = await whoIsAsking(app, req);
  // Apps can't read the store's currency, so use the latest order's: the one totals are compared in.
  const { data: latest } = await app.store
    .asUser(asking)
    .get<{ data: StoreOrder[] }>('/api/v1/orders', { include: 'orderGroup', limit: 1 });

  json(res, 200, { limit: app.data.limit(asking.store), currency: latest[0]?.orderGroup?.currency ?? null });
};

export const saveSettings: Route = async (app, req, res) => {
  const { store, session } = await whoIsAsking(app, req);
  const { limit } = await readJson<{ limit?: unknown }>(req);

  // A role FlyCommerce adds later gets the least access until this list names it.
  if (!ROLES_THAT_CHANGE_SETTINGS.includes(session.user_role)) {
    throw new HttpError(403, 'not_allowed', 'Only the store owner or an admin can change this.');
  }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) {
    throw new HttpError(422, 'invalid_limit', 'The limit must be a number, 0 or more.');
  }

  app.data.setLimit(store, limit);
  json(res, 200, { limit });
};
