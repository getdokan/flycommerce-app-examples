# Shopping Assistant: notes for coding agents

A FlyCommerce example app: a chat bubble on the storefront that finds products, lets the shopper add them to the cart, and shows a signed-in customer their orders. Plain TypeScript on Node 22+ (ESM) and `node:http` on the server; plain JavaScript in a shadow root on the store page. No framework, no database, no dashboard pages, no AI key: the replies come from rules in `src/chat.ts`.

## Files

| File                      | What it does                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/server.ts`           | Every route in one table; `createApp()` wires config, sealed credentials and the SDK clients                      |
| `src/install.ts`          | Install redirect: `handleInstall()` keeps the store's credential                                                  |
| `src/chat.ts`             | `POST /api/chat` and its preflight: `allowStorefrontCalls()`, `authenticateShopper()`, `reply()`                  |
| `src/search.ts`           | `understand()` and `findProducts()`: `GET /api/v1/search/products`, then the price limit                          |
| `src/orders.ts`           | `shopperOrders()`: `GET /api/v1/orders?filters[customerId]=` for the token's customer only                        |
| `src/storefront.ts`       | Serves `storefront/assistant.js` with `__APP_ID__` and `__APP_URL__` filled in                                    |
| `storefront/assistant.js` | The bubble; calls `window.FlyCommerce.shopperToken()`, `run('cart.add')`, `run('nav.goto')`, `run('ui.openCart')` |
| `src/dev.ts`              | `npm run dev`: emulator store with products and orders, the app, and the example store page on 4000-4003          |
| `test/chat.test.ts`       | Against the emulator                                                                                              |

## Commands

```bash
npm run dev     # run everything on ports 4000-4003; the store page is http://localhost:4003/storefront
npm test        # node --test test/*.test.ts
npm run build   # compile the server to dist/
npm start       # node dist/server.js, configured by .env
npx prettier --write .
```

## Platform rules this app relies on

The guide is https://developers.flycommerce.com/docs/apps (section 4 for storefront scripts); the API reference is https://developers.flycommerce.com/docs.

- **The store and the customer come only from the verified shopper token** (`authenticateShopper()`), never from the message, a URL or a header. `customerId` is null for a guest and when the merchant didn't grant `storefront.customer`.
- **Ask for a fresh shopper token for each question.** It lasts 5 minutes and signing in or out changes it.
- **Show a customer only their own orders:** always filter by the token's `customerId`. The store doesn't do it for you when the app reads as itself.
- **Change the cart only through `window.FlyCommerce.run()`,** after the shopper's click. Never call the store's cart API from the server: an app token is refused there, and the app must never see the cart's id.
- **Feature-detect:** stores that predate the actions have no `run` or `shopperToken`; the bubble doesn't start without `shopperToken`, and falls back to a link without `run`.
- **The bubble never reads the page:** no cookies, storage or forms. Build every element with `textContent`, never `innerHTML` with data.
- **Search:** `/api/v1/search/products` ranks and tolerates typos on a real store; the emulator ranks by matching words. Prices may arrive as strings: `Number()` them.
- Keep every file small, one concept each, comments only for a non-obvious why.

## Recipes

### Put a language model behind it

Replace `reply()` in `src/chat.ts`. Give the model two tools that call `findProducts()` and `shopperOrders()`, and return the same `Reply` shape. Treat product text as untrusted input to the model, and never let the model add to the cart: the shopper's click does that.

### Answer a new kind of question

Add a pattern and a function next to `ORDER_QUESTION` in `src/chat.ts`, returning a `Reply`. If it needs a new store API, ask for its permission and add it to the README's table.

### Change what a product card shows

The server's `ProductCard` in `src/search.ts` and `show()` in `storefront/assistant.js`. Keep the card's `id` and `slug`: **Add to cart** and **View** need them.
