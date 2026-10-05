import { isInstallationRevoked } from '@flycommerce/app-server';
import { subscribeToOrders } from './install.js';
import type { StoreOrder } from './orders.js';
import { needsReview } from './rule.js';
import type { App } from './server.js';

const HOUR = 60 * 60 * 1000;

/** Queues big orders created since the last run, as the app, in case their webhook never arrived. Returns how many. */
export async function catchUp(app: App, store: string, now = new Date()): Promise<number> {
  const since = app.data.caughtUpTo(store) ?? new Date(now.getTime() - HOUR).toISOString();
  const client = app.store.asApp(store);
  let queued = 0;

  if (!app.data.webhookSecret(store)) {
    await subscribeToOrders(app, store).catch((error) =>
      console.error(`[order-review] could not subscribe ${store}`, error)
    );
  }

  try {
    // An order created since then was updated since then too; the API filters on updatedAt.
    const orders = client.paginate<StoreOrder>('/api/v1/orders', {
      'filters[updatedAt]': `>=${since}`,
      sort: 'createdAt',
    });

    for await (const order of orders) {
      const isNew = Date.parse(order.createdAt) >= Date.parse(since);
      if (isNew && needsReview(order.total, app.data.limit(store)) && app.data.enqueue(store, order.id)) queued++;
    }
  } catch (error) {
    // FlyCommerce: nobody tells an app it was uninstalled; a refused fresh token does — https://developers.flycommerce.com/docs/apps
    if (isInstallationRevoked(error)) {
      app.config.credentials.delete(store);
      app.data.delete(store);
      return 0;
    }
    throw error;
  }

  app.data.setCaughtUpTo(store, now.toISOString());
  return queued;
}

export async function catchUpAll(app: App): Promise<void> {
  for (const store of app.data.stores().filter((store) => app.config.credentials.get(store))) {
    await catchUp(app, store).catch((error) => console.error(`[order-review] catch-up failed for ${store}`, error));
  }
}

/** Catches up now, which also re-subscribes any store left without a webhook, then every hour. */
export function catchUpEveryHour(app: App): () => void {
  void catchUpAll(app);
  const timer = setInterval(() => void catchUpAll(app), HOUR);
  return () => clearInterval(timer);
}
