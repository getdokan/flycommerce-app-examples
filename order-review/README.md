# Order Review

Hold big orders until you've checked them. Orders whose total is above a limit the merchant sets land in a Review queue inside their FlyCommerce dashboard, and the merchant puts each one on hold or releases it. It's a small app on purpose: one business rule, two pages, and every part of the platform a real app uses, so you can read all of it in one sitting.

> **Preview.** This example installs once the FlyCommerce app SDK is on npm.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` starts the emulator (FlyCommerce and a store, on your machine), an example dashboard and the app, and installs the app on a demo store. No FlyCommerce account needed.

- **Dashboard:** http://127.0.0.1:4003/apps/queue shows the app's pages the way a merchant sees them.
- **Simulate:** http://127.0.0.1:4004 does what happens outside the app: place an order, place a big one, drop a webhook, run the hourly catch-up now, uninstall the app.

`npm test` runs the whole journey against the emulator. `npm run build`, then `npm start`, runs the app for real.

## How it works

1. **Install.** The merchant approves the app; the app trades the one-time code for the store's credential and subscribes to `order.created`. [`src/install.ts`](src/install.ts)
2. **Know who's asking.** Every request from a page carries a session token; the app verifies it and trusts only the store it names. [`src/session.ts`](src/session.ts)
3. **A new order arrives.** The store posts `order.created`; the app checks the signature on the raw body, ignores a repeat, and answers at once. [`src/webhooks.ts`](src/webhooks.ts)
4. **The rule.** An order whose total is above the store's limit needs review. [`src/rule.ts`](src/rule.ts), with the limit set on the Settings page: [`src/settings.ts`](src/settings.ts)
5. **The queue.** The Review queue page reads each queued order from the store as the user, and holds or releases it as the user, showing the store's own message when it refuses. [`src/orders.ts`](src/orders.ts), [`src/pages/ReviewQueue.tsx`](src/pages/ReviewQueue.tsx)
6. **Never miss one.** An hourly job reads new orders as the app and queues any big one whose webhook never arrived. [`src/catch-up.ts`](src/catch-up.ts)
7. **Uninstall.** Nobody tells an app it was removed; when a fresh app token is refused, the app drops the store's data and stops serving it. [`src/catch-up.ts`](src/catch-up.ts), [`src/data.ts`](src/data.ts)

Every route is in one table in [`src/server.ts`](src/server.ts). [TUTORIAL.md](TUTORIAL.md) builds the app in these steps, one commit each.

## Run it on your store

1. Create an app in the [developer portal](https://developers.flycommerce.com). Set its install URL to `https://<your host>/auth/callback` and ask for the `orders.read`, `orders.write` and `webhooks.manage` permissions.
2. Put your app ID in `app-config.json` as `appId`, and your host in `appUrl`.
3. Copy `.env.example` to `.env` and fill it in.
4. `npm run build`, then `npm start` on a host the internet can reach over HTTPS.
5. Release a version in the portal's **Versions** tab with the same `app-config.json`.
6. Install the app from **Apps** in your store's dashboard. Unpublished, it's a private app: it installs only on stores your account owns.

The app keeps its data and the stores' sealed credentials in JSON files, so run a single instance. For more, put `src/data.ts`'s methods on a database and implement the SDK's `CredentialStore` there too.

## What to read next

- [Building apps](https://developers.flycommerce.com/docs/apps): the guide this example follows.
- [API reference](https://developers.flycommerce.com/docs): every endpoint, its fields and the permission it needs.
- [`@flycommerce/ui`](https://ui.flycommerce.com): the components the pages are built with.
