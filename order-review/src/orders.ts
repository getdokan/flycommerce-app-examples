import type { IncomingMessage } from 'node:http';
import { type DashboardSession, HttpError, StoreApiError, json, readJson } from '@flycommerce/app-server';
import type { App, Route } from './server.js';
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

export const showQueue: Route = async (app, req, res) => {
  const asking = await whoIsAsking(app, req);
  json(res, 200, { orders: await queuedOrders(app, asking) });
};

export const hold: Route = async (app, req, res) => {
  const asking = await whoIsAsking(app, req);
  const id = await queuedOrderId(app, asking, req);

  await app.store.asUser(asking).request('PATCH', orderPath(id, '/on-hold'));

  json(res, 200, { orders: await queuedOrders(app, asking) });
};

export const release: Route = async (app, req, res) => {
  const asking = await whoIsAsking(app, req);
  const id = await queuedOrderId(app, asking, req);
  const store = app.store.asUser(asking);
  const { data: order } = await store.get<{ data: StoreOrder }>(orderPath(id));

  if (order.status === 'on_hold') {
    await store.request('PATCH', orderPath(id, '/remove-hold'));
  }
  app.data.dequeue(asking.store, id);

  json(res, 200, { orders: await queuedOrders(app, asking) });
};

// FlyCommerce: as the user, the store decides what this user may do — https://developers.flycommerce.com/docs/apps
async function queuedOrders(app: App, asking: DashboardSession): Promise<StoreOrder[]> {
  const store = app.store.asUser(asking);

  const orders = await Promise.all(
    app.data.queue(asking.store).map(async ({ id }) => {
      try {
        const { data } = await store.get<{ data: StoreOrder }>(orderPath(id), { include: 'orderGroup' });
        return data;
      } catch (error) {
        if (!(error instanceof StoreApiError && error.upstreamStatus === 404)) throw error;
        // Deleted in the store, so there is nothing left to review.
        app.data.dequeue(asking.store, id);
        return null;
      }
    })
  );

  return orders.filter((order) => order !== null);
}

async function queuedOrderId(app: App, asking: DashboardSession, req: IncomingMessage): Promise<string> {
  const { orderId } = await readJson<{ orderId?: unknown }>(req);

  if (typeof orderId !== 'string' || !app.data.queue(asking.store).some((order) => order.id === orderId)) {
    throw new HttpError(404, 'not_in_queue', 'That order is not in the review queue.');
  }

  return orderId;
}

function orderPath(id: string, action = ''): string {
  return `/api/v1/orders/${encodeURIComponent(id)}${action}`;
}
