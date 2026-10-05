import { json, readWebhook } from '@flycommerce/app-server';
import { needsReview } from './rule.js';
import type { Route } from './server.js';

// The order as the store keeps it, not as the API returns it: money is a decimal string.
interface StoredOrder {
  id: string;
  total: string;
}

// FlyCommerce: the store in the URL is trusted only because the body verifies under its secret — https://developers.flycommerce.com/docs/apps
export const orderCreated: Route = async (app, req, res) => {
  const { store, delivery } = await readWebhook<StoredOrder>(req, (store) => app.data.webhookSecret(store));
  const order = delivery.data;
  const queued = needsReview(order.total, app.data.limit(store)) && app.data.enqueue(store, order.id);

  json(res, 200, { queued });
};
