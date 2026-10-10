# Shopping Assistant

A chat bubble on the storefront. A shopper asks for a product, with a top price if they like ("… under 20"), and gets product cards with **Add to cart**; asks "where's my order?" and, if they're signed in, sees their last orders. It's the example to start from for any app shoppers talk to: a support bot, a gift finder, an AI assistant.

It shows the four things a storefront app does:

1. **Run on the store page:** a storefront script declared in `app-config.json`, drawn in its own shadow root (`storefront/assistant.js`).
2. **Ask its own server, as this shopper:** the script gets a short-lived shopper token from the store and sends it with each question; the server verifies it before trusting the store or the customer it names (`src/chat.ts`).
3. **Read the store:** the server searches products and reads that customer's orders, as the app (`src/search.ts`, `src/orders.ts`).
4. **Act through the store:** **Add to cart** calls the store's own `cart.add`, so the cart and its drawer update, the store announces the change and offers Undo, and its limits apply. The app never sees the cart or the shopper's sign-in.

The answers come from simple rules in `src/chat.ts`, so it runs without an AI key. To put a language model behind it, replace `reply()`: keep `findProducts()` and `shopperOrders()` as its tools, and leave adding to the cart to the shopper's click.

## Run it

You need Node 22 or later. No FlyCommerce account: the emulator plays the store, the hub and the store page.

```bash
npm install
npm run dev
```

Open the storefront address it prints (`http://localhost:4003/storefront`) and click **Ask us**. Ask for "green tea under 20" and add one to the cart. Ask "where's my order?" as a guest, then switch **Shopper** to signed in and ask again.

```bash
npm test        # search, orders and the shopper token, end to end against the emulator
```

## What the app asks the merchant for

| Permission            | Why                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `storefront.scripts`  | To show the bubble                                                                                                                              |
| `catalog.read`        | To search products                                                                                                                              |
| `orders.read`         | To read the signed-in customer's orders                                                                                                         |
| `storefront.customer` | To know which customer is signed in. Without it the bubble still searches, and tells a signed-in shopper their orders are on their account page |

## How it fits together

```
shopper ─ asks ─▶ bubble (storefront/assistant.js)
                    │ window.FlyCommerce.shopperToken(APP_ID)   5 minutes, names the shopper
                    ▼
                  POST APP_URL/api/chat   Authorization: Bearer <shopper token>
                    │ authenticateShopper(): store, signedIn, customerId
                    ▼
                  the store API, as the app
                    • GET /api/v1/search/products?search=…
                    • GET /api/v1/orders?filters[customerId]=…
                    ▼
                  product cards ─ Add to cart ─▶ window.FlyCommerce.run('cart.add', …)
```

## Files

| File                      | What it does                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/server.ts`           | Every route in one table; `createApp()` wires config, sealed credentials and the SDK clients                         |
| `src/install.ts`          | Install redirect: `handleInstall()` keeps the store's credential                                                     |
| `src/chat.ts`             | `POST /api/chat`: `allowStorefrontCalls()`, `authenticateShopper()`, then `reply()` picks search or orders           |
| `src/search.ts`           | `understand()` splits "green tea under 20" into words and a top price; `findProducts()` searches and keeps what fits |
| `src/suggest.ts`          | `productSuggestions()`: the chips name products this store sells                                                     |
| `src/orders.ts`           | `shopperOrders()`: a guest is asked to sign in; a signed-in customer sees their last 3 orders                        |
| `src/storefront.ts`       | `GET /storefront/assistant.js`: the bubble, with the App ID and server address filled in                             |
| `storefront/assistant.js` | The bubble: chat, product cards, **Add to cart** and **View** through the store's actions                            |
| `src/dev.ts`              | `npm run dev`: the emulator with teas, mugs and a customer's orders, the app, and the store page                     |
| `test/chat.test.ts`       | Against the emulator: search, price, orders by customer, guests, the missing permission, tokens                      |

## Run it on your store

Create a development app in the developer portal, then use the CLI: `flycommerce app link --config dev` and `flycommerce app dev --config dev`. Install it on your own store and ask for the four permissions above. The [Building apps](https://developers.flycommerce.com/docs/apps) guide, section 4, covers storefront scripts, the store's actions and shopper tokens.
