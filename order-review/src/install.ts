import { handleInstall, reconcileWebhook } from '@flycommerce/app-server';
import type { App, Route } from './server.js';

export const install: Route = async (app, _req, res, url) => {
  await handleInstall(url, res, {
    hub: app.hub,
    credentials: app.config.credentials,
    frameAncestors: app.config.frameAncestors,
    appName: 'Order Review',
    onInstalled: async (store) => {
      app.data.add(store);
      await subscribeToOrders(app, store);
    },
  });
};

// FlyCommerce: an app subscribes to webhooks itself, as the app — https://developers.flycommerce.com/docs/apps
export async function subscribeToOrders(app: App, store: string): Promise<void> {
  const endpoint = new URL(`/webhooks/order-created?store=${encodeURIComponent(store)}`, app.url).toString();
  const subscription = { endpoint, events: ['order.created'], description: 'Order Review' };
  const { secret } = await reconcileWebhook(app.store.asApp(store), subscription);

  app.data.setWebhookSecret(store, secret);
}
