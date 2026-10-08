# Order Notifier

Receive instant notifications in your Telegram chat or team channel whenever a new order is placed on your FlyCommerce store.

This example app demonstrates:

1. **Real-time Webhooks:** subscribing to store events (`orders.create`) and verifying incoming HMAC-SHA256 signatures (`src/webhooks.ts`).
2. **Encrypted Credentials at Rest:** sealing third-party API tokens (`botToken`) using `@flycommerce/app-server`'s `Sealer` (`src/data.ts`).
3. **Session-Authenticated Dashboard Settings:** an administrative settings page built with [`@flycommerce/ui`](https://ui.flycommerce.com) that verifies `whoIsAsking()` via session tokens (`src/pages/Settings.tsx`, `src/settings.ts`).
4. **Third-Party API Dispatch:** formatting order payloads and dispatching rich messages to the Telegram Bot API (`src/telegram.ts`).

---

## Run it locally

You need Node 22 or later. No FlyCommerce account or Telegram bot is needed to test: the emulator mocks the platform, and local tests mock the Telegram API.

```bash
cd order-notifier
npm install
npm run dev
```

Open the dashboard URL printed to your terminal (e.g. `http://127.0.0.1:4007/apps/settings`).

```bash
npm test        # Runs end-to-end tests against the emulator
```

---

## File Structure

| File                     | Purpose                                                                                     |
| :----------------------- | :------------------------------------------------------------------------------------------ |
| `src/server.ts`          | Server setup, route registration, and app bootstrap.                                        |
| `src/webhooks.ts`        | `POST /webhooks/orders`: verifies HMAC signature, checks thresholds, and sends alert.       |
| `src/telegram.ts`        | Formats order summary text and sends messages via Telegram Bot API.                         |
| `src/settings.ts`        | `GET/PUT /api/settings` and `POST /api/test-alert`: saves settings and sends test messages. |
| `src/data.ts`            | Multi-store settings storage with AES-256-GCM sealed bot tokens on disk.                    |
| `src/session.ts`         | Verifies FlyCommerce session tokens to ensure calls originate from the store owner.         |
| `src/install.ts`         | Handles OAuth install callback and automatically registers the webhook subscription.        |
| `src/pages/Settings.tsx` | Dashboard UI for configuring bot token, chat ID, and notification rules.                    |
| `test/notifier.test.ts`  | End-to-end tests verifying webhook signatures, sealing at rest, and Telegram alerts.        |

---

## Setting Up with a Real Telegram Bot

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`, choose a name and username, and copy the **Bot Token**.
3. Open your bot on Telegram and click **Start** (or add your bot to a group/channel).
4. Get your **Chat ID** (send a message to your bot, then open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in your browser, or use `@userinfobot`).
5. Open **Telegram Alerts** in your FlyCommerce store dashboard, paste your token and Chat ID, and click **Send Test Alert**.

---

## Run it on a real store

1. In the [FlyCommerce Developer Portal](https://developers.flycommerce.com), create an app and request the `orders.read` and `webhooks.manage` permissions.
2. Set the install URL to `https://<your-app-domain>/auth/callback`.
3. Set your production environment variables (`FLYCOMMERCE_APP_ID`, `FLYCOMMERCE_APP_SECRET`, `ENCRYPTION_KEY`, `APP_URL`).
4. Run `npm run build && npm start`.
