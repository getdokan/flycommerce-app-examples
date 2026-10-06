# Order Export: notes for coding agents

A FlyCommerce example app. A page inside the merchant's dashboard downloads the orders placed in a period as a CSV file. The merchant chooses the columns, and a Settings page keeps the file name format and the default columns per store. Plain TypeScript on Node 22+ (ESM), `node:http`, React 19 and `@flycommerce/ui`. No framework, no database (settings live in one JSON file), no webhooks. One storefront script, a welcome message, in plain JavaScript.

## Files

| File                         | What it does                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/server.ts`              | Every route in one table; `createApp()` wires config, sealed credentials, settings and the SDK clients          |
| `src/install.ts`             | Install redirect: `handleInstall()` keeps the store's credential                                                |
| `src/session.ts`             | `whoIsAsking()`: verifies the session token and refuses stores the app no longer serves                         |
| `src/export.ts`              | `GET /api/export?from&to&columns`: `paginate()` the orders as the user, oldest first, stop at `to`, answer CSV  |
| `src/columns.ts`             | `StoreOrder` and `COLUMNS`: each column's key, header and value; the file's column order. Shared with the pages |
| `src/csv.ts`                 | `toCsv()`: quoting, the formula guard, and a byte-order mark for Excel                                          |
| `src/settings.ts`            | `GET`/`PUT /api/settings`; `checkColumns()` and the file name format check, both 400 with a message             |
| `src/data.ts`                | `Data`: per-store settings in `DATA_FILE`, defaults when a store has none, written atomically                   |
| `src/pages/main.tsx`         | Picks the page by `window.location.pathname`                                                                    |
| `src/pages/ExportOrders.tsx` | The export page: `DateRangePicker`, the columns, and a download through `bridge.fetch()`                        |
| `src/pages/Settings.tsx`     | The settings page: file name format with a preview, default columns, Save with a toast                          |
| `src/pages/ColumnChoice.tsx` | The column checkboxes, drawn from `COLUMNS`                                                                     |
| `src/pages/api.ts`           | `useApi()`: JSON calls to the app's server that throw the server's message                                      |
| `src/pages/fileName.ts`      | Fills in `{store}`, `{from}`, `{to}` and replaces unsafe characters with `-`; `dates.ts` has the day maths      |
| `src/storefront.ts`          | `GET /storefront/welcome.js`: serves `storefront/welcome.js` as JavaScript                                      |
| `storefront/welcome.js`      | The storefront script: a welcome message in a shadow root, follows `flycommerce:page`, closes with ×            |
| `src/dev.ts`                 | `npm run dev`: emulator with sample orders, the app, and the example dashboard and storefront on 4000-4003      |
| `test/export.test.ts`        | Against the emulator: install, session check, paging, CSV safety, a bad period, columns, settings per store     |
| `test/storefront.test.ts`    | The script is declared on the app's host, served as JavaScript, and run by the emulator's storefront            |
| `app-config.json`            | The app's dashboard pages and storefront script, uploaded to the developer portal on each release               |

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

- **The store comes only from the verified session token** (`whoIsAsking()`), never from a URL, body or header. Settings are read and written for that store only.
- **As the user** (`app.store.asUser(asking)`): the store decides whether this person may read orders, and its refusal is shown as it is.
- **Paging:** `paginate()` follows the store's pages (`paginate=full`); breaking out of the loop stops asking. `filters[createdAt]` takes one bound (`>=`, `>`, `<=`, `<`), so the upper bound is applied while reading.
- **Order fields:** the buyer's name and email are on `orderGroup.customerInfo` (ask for `include=orderGroup`), not on the address. `total` is copied as the store sends it; the app does no money arithmetic.
- **Roles:** only `owner` and `admin` open apps today. Treat any other role as the least privileged.
- **Secrets** come from the environment; store credentials are sealed at rest. Never log tokens, secrets or customer data.
- **Pages** follow the `@flycommerce/ui` guide (https://ui.flycommerce.com): `PageHeader` outside the dashboard, `Field` around inputs, tokens only, and `className` for layout, never to restyle.
- **Storefront scripts** run on the store's own pages: keep to your own element in a shadow root, never read the page's cookies, storage or forms, stay small, and never assume load order. They don't run on checkout, account or sign-in pages.
- Keep every file small, one concept each, comments only for a non-obvious why.

## Recipes

### Add a column

Add an entry to `COLUMNS` in `src/columns.ts`: a stable `key`, the `header`, and `value()` to read it from an order. Add the field to `StoreOrder` if it's new, and if it lives in a relation, add that relation to `include` in `src/export.ts`. Its place in the list is its place in the file. The checkboxes, the server's check and the defaults follow the list; stores that already saved their default columns keep them, so it starts unchecked for them. Add the key to `ALL_COLUMNS` in `test/export.test.ts`.

### Add a setting

Add the field to `Settings` and `DEFAULT_SETTINGS` in `src/data.ts`, check it in `saveSettings` in `src/settings.ts` (400 with a message the page can show), and add a control for it to `src/pages/Settings.tsx`.

### Export only some orders

Add the store's filter to the `paginate()` query, e.g. `'filters[status]': 'completed'`, and a control for it on the page that sends it in the URL. Read it from `url.searchParams` in `exportOrders`, and accept only the values you expect.

### Change the storefront message

Edit `GREETINGS` in `storefront/welcome.js`; the keys are `pageType` values (`home`, `product`, `category`, …) and `default` covers the rest. To add a second script, put the file in `storefront/`, serve it from a route in `src/storefront.ts`, and add it to `storefront.scripts` in `app-config.json` (at most 3, on `appUrl`'s host).

### Export something else

Copy `src/export.ts` to, say, `src/products.ts`, read `/api/v1/products` with the fields you need, add `'GET /api/products': exportProducts` to the route table in `src/server.ts`, and request `catalog.read` in the developer portal. Check the API reference for which filters and sorts that list accepts.
