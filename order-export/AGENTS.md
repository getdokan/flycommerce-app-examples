# Order Export: notes for coding agents

A FlyCommerce example app. A page inside the merchant's dashboard downloads the orders placed in a period as a CSV file. Plain TypeScript on Node 22+ (ESM), `node:http`, React 19 and `@flycommerce/ui`. No framework, no database, no webhooks.

## Files

| File                         | What it does                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/server.ts`              | Both routes in one table; `createApp()` wires config, sealed credentials and the SDK clients           |
| `src/install.ts`             | Install redirect: `handleInstall()` keeps the store's credential                                       |
| `src/session.ts`             | `whoIsAsking()`: verifies the session token and refuses stores the app no longer serves                |
| `src/export.ts`              | `GET /api/export?from&to`: `paginate()` the orders as the user, oldest first, stop at `to`, answer CSV |
| `src/csv.ts`                 | `toCsv()`: quoting, the formula guard, and a byte-order mark for Excel                                 |
| `src/pages/ExportOrders.tsx` | The page: `DateRangePicker`, a button, and a download through `bridge.fetch()`                         |
| `src/dev.ts`                 | `npm run dev`: emulator with sample orders, the app, and the example dashboard on ports 4000-4003      |
| `test/export.test.ts`        | Against the emulator: install, session check, paging past one page, CSV safety, a bad period           |
| `app-config.json`            | The app's one dashboard page, uploaded to the developer portal on each release                         |

## Commands

```bash
npm run dev     # build the page, then run everything on ports 4000-4003
npm test        # build the page, then run test/*.test.ts with node --test
npm run build   # type-check and compile the server to dist/, build the page to dist/pages
npm start       # node dist/server.js, configured by .env
npx prettier --write .
```

## Platform rules this app relies on

The guide is https://developers.flycommerce.com/docs/apps; the API reference is https://developers.flycommerce.com/docs. Check field names there or in `@flycommerce/app-emulator`, never by guessing.

- **The store comes only from the verified session token** (`whoIsAsking()`), never from a URL, body or header.
- **As the user** (`app.store.asUser(asking)`): the store decides whether this person may read orders, and its refusal is shown as it is.
- **Paging:** `paginate()` follows the store's pages (`paginate=full`); breaking out of the loop stops asking. `filters[createdAt]` takes one bound (`>=`, `>`, `<=`, `<`), so the upper bound is applied while reading.
- **Order fields:** the buyer's name and email are on `orderGroup.customerInfo` (ask for `include=orderGroup`), not on the address. `total` is copied as the store sends it; the app does no money arithmetic.
- **Roles:** only `owner` and `admin` open apps today. Treat any other role as the least privileged.
- **Secrets** come from the environment; store credentials are sealed at rest. Never log tokens, secrets or customer data.
- **Pages** follow the `@flycommerce/ui` guide (https://ui.flycommerce.com): `PageHeader` outside the dashboard, `Field` around inputs, tokens only, and `className` for layout, never to restyle.
- Keep every file small, one concept each, comments only for a non-obvious why.

## Recipes

### Add a column

Add the field to `StoreOrder` and its heading to `HEADER` in `src/export.ts`, then the value to `row()` in the same position. If it lives in a relation, add that relation to `include`. Update the header assertion in `test/export.test.ts`.

### Export only some orders

Add the store's filter to the `paginate()` query, e.g. `'filters[status]': 'completed'`, and a control for it on the page that sends it in the URL. Read it from `url.searchParams` in `exportOrders`, and accept only the values you expect.

### Export something else

Copy `src/export.ts` to, say, `src/products.ts`, read `/api/v1/products` with the fields you need, add `'GET /api/products': exportProducts` to the route table in `src/server.ts`, and request `catalog.read` in the developer portal. Check the API reference for which filters and sorts that list accepts.
