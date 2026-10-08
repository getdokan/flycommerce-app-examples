# Order Notifier — Agent Guidelines

Context for coding agents extending or working on the `order-notifier` example app.

## Architecture & Conventions

- **Server:** Pure Node.js `node:http` server in `src/server.ts`. No Express, Fastify, or external framework dependencies.
- **Webhooks:** All incoming webhooks must be verified using `readWebhook()` from `@flycommerce/app-server`. Never parse webhook bodies without verifying `X-Webhook-Signature`.
- **Session Tokens:** All merchant dashboard API calls (`/api/settings`, `/api/test-alert`) must call `whoIsAsking(app, req)`. Never trust store names passed in request bodies or query parameters.
- **Secret Storage:** Sensitive tokens (`botToken`, `webhookSecret`) must be encrypted at rest using `@flycommerce/app-server`'s `Sealer`. Never write raw plaintext bot tokens to disk.
- **Testing:** All tests in `test/notifier.test.ts` run against `@flycommerce/app-emulator` and mock external third-party HTTP endpoints. Tests must run without network access or live Telegram credentials.
