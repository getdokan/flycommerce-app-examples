import { json } from '@flycommerce/app-server';
import { needsReview } from './rule.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';

/** The fields of a store order this app uses. The store sends more. */
export interface StoreOrder {
  id: string;
  orderNo: number;
  status: string;
  total: number;
  createdAt: string;
  orderGroup?: { currency: string };
}

// FlyCommerce: as the user, the store decides what this user may do — https://developers.flycommerce.com/docs/apps
export const showQueue: Route = async (app, req, res) => {
  const asking = await whoIsAsking(app, req);
  const { data: orders } = await app.store
    .asUser(asking)
    .get<{ data: StoreOrder[] }>('/api/v1/orders', { include: 'orderGroup', limit: 50 });

  const limit = app.data.limit(asking.store);

  json(res, 200, { orders: orders.filter((order) => needsReview(order.total, limit)) });
};
