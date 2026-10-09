# Order Notifier

A Telegram message whenever an order is placed. The merchant creates a bot with @BotFather, pastes its token and their chat ID on a Settings page inside the FlyCommerce dashboard, and from then on every new order arrives in that chat: number, total, status and, if they want, the customer's name and email.

It's the example to read after [`order-export`](../order-export), for the part that one leaves out: **the store telling the app something happened**.

1. **Subscribe:** on install the app asks the store for an `order.created` webhook to its own URL, and keeps the signing secret it gets back (`src/install.ts`, `subscribe()` in `src/webhooks.ts`).
2. **Verify:** each delivery is checked against that store's secret, over the raw body, before anything reads it (`readWebhook()` in `src/webhooks.ts`).
3. **Read the order:** a delivery carries the order as the store keeps it, with no customer or currency, so the app reads the order from the store API as itself (`asApp()`), then sends the message (`src/alert.ts`, `src/telegram.ts`).

The bot token is the merchant's secret: it is sealed on disk, and the server never sends it back to the page. The webhook secrets are sealed too (`src/data.ts`).

## Run it

You need Node 22 or later. No FlyCommerce account: the emulator plays the store, the hub and the dashboard.

```bash
npm install
npm run dev
```

Open the dashboard address it prints (`http://127.0.0.1:4007/apps/settings`), paste a real bot token and chat ID, switch alerts on and click **Save**, then **Send test alert**. Back in the terminal, press Enter: the emulator's store places an order and delivers `order.created` to the app, and the alert arrives in Telegram. Every second order has a customer called `Tom & <Jerry>`, to show the message escaping it.

```bash
npm test        # end to end against the emulator and a stand-in Telegram, no network
```

## Files

| File                     | What it does                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/server.ts`          | Every route in one table, and `createApp()`. Start here.                                               |
| `src/install.ts`         | The install URL: keeps the store's credential, then subscribes the store                               |
| `src/webhooks.ts`        | `subscribe()`, and `POST /webhooks/orders`: verify, read the order, check the settings, send the alert |
| `src/alert.ts`           | The message, with every value from the store escaped for Telegram's HTML                               |
| `src/telegram.ts`        | `sendMessage` through the merchant's bot                                                               |
| `src/settings.ts`        | `GET` and `PUT /api/settings`, and `POST /api/test-alert`                                              |
| `src/data.ts`            | Each store's settings and webhook secret in one JSON file, the secrets sealed                          |
| `src/session.ts`         | `whoIsAsking()`: verifies the session token                                                            |
| `src/pages/Settings.tsx` | The settings page, built with [`@flycommerce/ui`](https://ui.flycommerce.com)                          |
| `src/dev.ts`             | `npm run dev`: the emulator, the app and the example dashboard; Enter places an order                  |
| `test/notifier.test.ts`  | Install and subscription, the session check, sealing, signatures, the alert and its escaping           |

## Run it on a real store

1. In the [developer portal](https://developers.flycommerce.com), create an app, request the `orders.read` and `webhooks.manage` permissions, and set the install URL to `https://<your-app>/auth/callback`.
2. Create a version, put your App ID, version and URL in `app-config.json`, and upload it to that version.
3. Copy `.env.example` to `.env` and fill it in. `APP_URL` must be reachable by the store over HTTPS: that's where webhooks go. Then `npm run build && npm start`.
4. Install the app on a store you own: it's under **Apps → Your apps** until it's published.

## What it doesn't do

- **Retry.** A store sends each event once and doesn't retry ([webhooks](https://github.com/getdokan/flycommerce-sdk/blob/main/spec/webhooks.md)). If Telegram is down when an order arrives, that alert is lost; the app logs it and answers `{ "delivered": false }`.
- **Notice a deleted subscription.** If the merchant deletes the webhook in their dashboard, alerts stop. Saving the settings subscribes again only when the app has no secret for the store.
- **One alert per checkout on a marketplace.** `order.created` is per order, and a checkout with several vendors' products makes one order for each, so one alert each.
- **Keep customer data.** Names and emails pass through on their way to Telegram; the app neither stores nor logs them.
