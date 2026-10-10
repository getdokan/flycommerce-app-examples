# Order Notifier: notes for coding agents

A FlyCommerce example app. When a store delivers an `order.created` webhook, the app reads the order and sends a message to the merchant's Telegram chat through the merchant's own bot. A Settings page keeps the bot token, chat ID, a minimum total and whether to include the customer, per store. Plain TypeScript on Node 22+ (ESM), `node:http`, React 19 and `@flycommerce/ui`. No framework, no database (one JSON file), no queue.

## Files

| File                     | What it does                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/server.ts`          | Every route in one table; `createApp()` wires config, sealed credentials, data, Telegram's URL and SDK clients |
| `src/install.ts`         | Install redirect: `handleInstall()` keeps the credential, `onInstalled` calls `subscribe()`                    |
| `src/webhooks.ts`        | `subscribe()`: `reconcileWebhook()` for `order.created`; `POST /webhooks/orders`: `readWebhook()`, then alert  |
| `src/alert.ts`           | `StoreOrder` and the message text; every store value goes through `escape()`                                   |
| `src/telegram.ts`        | `sendTelegramMessage()`: one `sendMessage` call, HTML parse mode, 10 s timeout                                 |
| `src/settings.ts`        | `GET`/`PUT /api/settings` (the token is write-only) and `POST /api/test-alert`                                 |
| `src/data.ts`            | `Data`: per-store settings and webhook secret in `DATA_FILE`; bot token and secret sealed with `Sealer`        |
| `src/session.ts`         | `whoIsAsking()`: verifies the session token and refuses stores the app no longer serves                        |
| `src/pages/Settings.tsx` | The settings page; `src/pages/api.ts` has `useApi()`                                                           |
| `src/dev.ts`             | `npm run dev`: emulator, app and example dashboard on 4004-4007; Enter places an order and delivers it         |
| `test/notifier.test.ts`  | Against the emulator and a stand-in Telegram server                                                            |

## Commands

```bash
npm run dev     # build the page, then run everything on ports 4004-4007
npm test        # build the page, then run test/*.test.ts with node --test
npm run build   # type-check and compile the server to dist/, build the page to dist/pages
npm start       # node dist/server.js, configured by .env
npx prettier --write .
```

## Platform rules this app relies on

The guide is https://developers.flycommerce.com/docs/apps; webhooks are specified in https://github.com/getdokan/flycommerce-sdk/blob/main/spec/webhooks.md. Check event and field names there or in `@flycommerce/app-emulator` (`WEBHOOK_EVENTS`), never by guessing.

- **Event names** are singular and past tense: `order.created`, not `orders.create`. The store refuses an unknown name with a 422.
- **The store of a delivery** comes from the endpoint's `?store=`, and is trusted only because the raw body verifies under that store's secret (`readWebhook()`). Never parse the body first.
- **A delivery's `data`** is the stored record: snake_case, money as decimal strings, status as a number, no relations. Take `data.id` and read the order from `/api/v1/orders/{id}?include=orderGroup` as the app (`asApp()`), which needs `orders.read`.
- **Deliveries are sent once**, not retried. Answer 2xx; a failure downstream is logged, not thrown back at the store.
- **The dashboard store** comes only from the verified session token (`whoIsAsking()`), never from a URL, body or header.
- **Secrets**: the bot token and webhook secrets are sealed at rest, the bot token is never sent to the page or logged, and `ENCRYPTION_KEY` comes from the environment.
- **Telegram HTML**: escape `&`, `<` and `>` in anything from the store, or Telegram refuses the whole message.
- **Pages** follow the `@flycommerce/ui` guide (https://ui.flycommerce.com): `PageHeader` outside the dashboard, `Field` around inputs, tokens only, and `className` for layout, never to restyle.
- Keep every file small, one concept each, comments only for a non-obvious why.

## Recipes

### Alert on another event

Add the event to `events` in `subscribe()` (for example `order.canceled`), branch on `delivery.event` in `handleOrderWebhook`, and add its message to `src/alert.ts`. Stores already installed keep their old subscription until `subscribe()` runs for them again.

### Add a field to the message

Add it to `StoreOrder` in `src/alert.ts` with the name the order API uses, add the relation to `include` in `src/webhooks.ts` if it lives in one, and pass it through `escape()`.
