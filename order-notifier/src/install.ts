import { handleInstall } from '@flycommerce/app-server';
import type { Route } from './server.js';
import { subscribe } from './webhooks.js';

// FlyCommerce: the store sends the merchant here with a one-time code, swapped for the store's credential — https://developers.flycommerce.com/docs/apps
export const install: Route = async (app, _req, res, url) => {
  await handleInstall(url, res, {
    hub: app.hub,
    credentials: app.config.credentials,
    frameAncestors: app.config.frameAncestors,
    appName: 'Order Notifier',
    onInstalled: (store) => subscribe(app, store),
  });
};
