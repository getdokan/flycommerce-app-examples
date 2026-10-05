# Order Review: notes for coding agents

A FlyCommerce example app. Orders whose total is above a per-store limit land in a Review queue, shown inside the merchant's dashboard, where the merchant holds or releases them. Plain TypeScript on Node 22+ (ESM), `node:http`, React 19 and `@flycommerce/ui`. No framework and no database.

## Files

| File                   | What it does                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/server.ts`        | Every route in one table; `createApp()` wires config, sealed credentials, SDK clients and data. Start here.  |
| `src/install.ts`       | Install redirect: `handleInstall()` keeps the credential; `onInstalled` subscribes with `reconcileWebhook()` |
| `src/session.ts`       | `whoIsAsking()`: verifies the session token and refuses stores the app no longer serves                      |
| `src/webhooks.ts`      | `order.created` via `readWebhook()`: verified, then the rule and the queue                                   |
| `src/rule.ts`          | The business rule: one pure function                                                                         |
| `src/orders.ts`        | The queue page's API: list, hold, release, all as the user                                                   |
| `src/settings.ts`      | The limit: read, and save for `owner` and `admin` only                                                       |
| `src/catch-up.ts`      | Hourly job as the app: queues orders whose webhook was missed; drops uninstalled stores                      |
| `src/data.ts`          | Per-store limit, queue and sealed webhook secret in one JSON file, written atomically                        |
| `src/dev.ts`           | `npm run dev`: emulator, example dashboard, app, and the Simulate page                                       |
| `src/pages/`           | The dashboard pages: `main.tsx` picks the page by path; `api.ts` calls the server with a session token       |
| `test/journey.test.ts` | One journey against the emulator, from install to uninstall                                                  |
| `app-config.json`      | The app's dashboard pages, uploaded to the developer portal on each release                                  |

## Commands

```bash
npm run dev     # build the pages, then run everything on ports 4000-4004
npm test        # build the pages, then run test/*.test.ts with node --test
npm run build   # type-check and compile the server to dist/, build the pages to dist/pages
npm start       # node dist/server.js, configured by .env
npx prettier --write .
```

## Platform rules this app relies on

The guide is https://developers.flycommerce.com/docs/apps; the API reference is https://developers.flycommerce.com/docs. Check field names there or in `@flycommerce/app-emulator`, never by guessing.

- **The store comes only from the verified session token** (`whoIsAsking()`), never from a URL, body or header. Webhooks are the one exception: the store in their URL is trusted only once that store's secret verifies the signature.
- **As the user** (`app.store.asUser(asking)`) for anything a person does on a page; the store checks their permissions. **As the app** (`app.store.asApp(store)`) for webhooks and jobs. Don't re-implement the store's permission or business checks: show its message.
- **Webhooks:** `readWebhook()` verifies `X-Webhook-Signature` on the raw body before parsing, and answers an unknown store and a bad signature the same way; each event is sent once with no ID, so handlers must be idempotent; answer 2xx fast. The body is a `WebhookDelivery`, `{ event, timestamp, data }`, and `data` is the record as the store keeps it: snake_case, money as decimal strings, statuses as the store's numbers.
- **Uninstall is silent.** A refused fresh app token (`isInstallationRevoked(error)`) means the merchant removed the app: delete its credential and `app.data.delete(store)`. Its webhooks are suspended until a reinstall.
- **Roles:** only `owner` and `admin` open apps today. Treat any other role as the least privileged.
- **Secrets** come from the environment; store credentials (`FileCredentialStore` with a `Sealer`) and webhook secrets are sealed at rest. Never log tokens, secrets or customer data.
- **Pages** follow the `@flycommerce/ui` guide (https://ui.flycommerce.com): `DataTable` for lists (it scrolls inside its card at 375px), `PageHeader` outside the dashboard, `Empty` with an `<Icon>`, `InputGroup` for amounts; tokens only, and `className` for layout, never to restyle.
- Keep every file small, one concept each, comments only for a non-obvious why. Use the SDK rather than writing token, signature or store-client code.

## Recipes

### Change the rule

Edit `needsReview()` in `src/rule.ts`. If the rule needs a field the webhook body doesn't carry, read the order in `src/webhooks.ts` with `app.store.asApp(store).get(...)` first; `src/catch-up.ts` already has the full order from the list. If it needs a new setting, add it to `StoreData` in `src/data.ts`, to `src/settings.ts`, and to `src/pages/Settings.tsx`. Update the journey test.

### Add a page

1. Add `{ "slug": "history", "label": "History", "path": "/history" }` to `dashboard.pages` in `app-config.json`; the server serves the pages bundle on every path listed there.
2. Create `src/pages/History.tsx` (call `useTitleBar`, fetch with `useApi()`), and add `'/history': History` to `pages` in `src/pages/main.tsx`.
3. For data, add a route such as `'GET /api/history': showHistory` to the table in `src/server.ts`, starting with `await whoIsAsking(app, req)`.
4. Release a new version with the changed `app-config.json` in the developer portal.

### React to another event

1. Add the event, e.g. `order.canceled`, to `events` in `subscribeToOrders()` in `src/install.ts`. One subscription carries every event, so the same endpoint and secret receive it.
2. In `src/webhooks.ts`, branch on `delivery.event`, and keep each branch idempotent; for a canceled order, `app.data.dequeue(store, order.id)`. Rename the route and endpoint from `order-created` to `orders` once it handles more than one event.
3. Stores that installed before the change still have the old subscription: call `subscribeToOrders(app, store)` once for each of `app.data.stores()`, for example where `catchUpEveryHour()` runs at startup.
4. Add a step to `test/journey.test.ts` that delivers it with `platform.store.deliver(STORE, 'order.canceled', …)`.
