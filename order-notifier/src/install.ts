import { handleInstall, reconcileWebhook } from '@flycommerce/app-server';
import type { Route } from './server.js';

// FlyCommerce: the store sends the merchant here with a one-time code, swapped for credentials
export const install: Route = async (app, _req, res, url) => {
  await handleInstall(url, res, {
    hub: app.hub,
    credentials: app.config.credentials,
    frameAncestors: app.config.frameAncestors,
    appName: 'Order Notifier',
    onInstalled: async (store: string) => {
      try {
        const storeClient = app.store.asApp(store);
        const webhookUrl = `${app.config.appUrl}/webhooks/orders?store=${encodeURIComponent(store)}`;

        const webhook = await reconcileWebhook(storeClient, {
          endpoint: webhookUrl,
          events: ['orders.create'],
          description: 'Order Notifier: New order alerts',
        });

        app.data.setWebhookSecret(store, webhook.secret);
      } catch (error) {
        console.warn(`Could not register webhook on ${store}:`, (error as Error).message);
      }
    },
  });
};
