import { json, readWebhook, reconcileWebhook } from '@flycommerce/app-server';
import { type StoreOrder, orderAlert } from './alert.js';
import type { App, Route } from './server.js';
import { sendTelegramMessage } from './telegram.js';

/** Leaves the store with one `order.created` subscription to this app, and keeps its signing secret. */
export async function subscribe(app: App, store: string): Promise<void> {
  const { secret } = await reconcileWebhook(app.store.asApp(store), {
    endpoint: `${app.config.appUrl}/webhooks/orders?store=${encodeURIComponent(store)}`,
    events: ['order.created'],
    description: 'Order Notifier: new order alerts',
  });

  app.data.setWebhookSecret(store, secret);
}

// FlyCommerce: the store is trusted only because the body verifies under its secret — https://developers.flycommerce.com/docs/apps
export const handleOrderWebhook: Route = async (app, req, res) => {
  const { store, delivery } = await readWebhook<{ id: string | number }>(req, (s) => app.data.webhookSecret(s));
  const settings = app.data.settings(store);

  if (!settings.enabled || !settings.botToken || !settings.chatId) {
    return json(res, 200, { skipped: 'notifications_disabled' });
  }

  // A delivery carries the stored record without its relations, so read the order as the API shapes it.
  const { data: order } = await app.store
    .asApp(store)
    .get<{ data: StoreOrder }>(`/api/v1/orders/${encodeURIComponent(delivery.data.id)}`, { include: 'orderGroup' });

  if (Number(order.total) < settings.minOrderValue) {
    return json(res, 200, { skipped: 'below_threshold' });
  }

  const result = await sendTelegramMessage(app.telegramApiUrl, settings, orderAlert(order, store, settings));
  if (!result.ok) console.warn(`[order-notifier] Telegram refused the alert for ${store}: ${result.description}`);

  json(res, 200, { delivered: result.ok });
};
