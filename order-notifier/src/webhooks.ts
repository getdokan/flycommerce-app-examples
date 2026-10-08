import { json, readWebhook } from '@flycommerce/app-server';
import type { Route } from './server.js';
import { type OrderPayload, formatOrderAlert, sendTelegramMessage } from './telegram.js';

export const handleOrderWebhook: Route = async (app, req, res) => {
  const { store, delivery } = await readWebhook<OrderPayload>(req, (s) => app.data.webhookSecret(s));

  const settings = app.data.settings(store);

  // If notifications are disabled or Telegram is not configured, acknowledge receipt and exit
  if (!settings.enabled || !settings.botToken || !settings.chatId) {
    json(res, 200, { ok: true, skipped: 'notifications_disabled' });
    return;
  }

  const order = delivery.data;
  const orderTotal = Number(order.total) || 0;

  // Check minimum order value threshold
  if (settings.minOrderValue > 0 && orderTotal < settings.minOrderValue) {
    json(res, 200, { ok: true, skipped: 'below_threshold' });
    return;
  }

  const message = formatOrderAlert(order, store, {
    includeCustomerInfo: settings.includeCustomerInfo,
  });

  await sendTelegramMessage({
    botToken: settings.botToken,
    chatId: settings.chatId,
    text: message,
    apiBaseUrl: process.env.TELEGRAM_API_URL,
  });

  json(res, 200, { ok: true, delivered: true });
};
