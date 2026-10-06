# Build your first FlyCommerce app

In four steps you'll build **Order Export**: a page inside the merchant's dashboard that downloads the orders placed in a period as a CSV file. Along the way you'll use the three things every FlyCommerce app does: install on a store, know who's asking, and read the store's data. Then you'll let the merchant make the file their own.

Each step is one commit, tagged `order-export-step-1` to `order-export-step-4`. To see the code after a step, run `git checkout order-export-step-2`.

> **Preview.** The SDK packages arrive on npm with FlyCommerce's app platform launch; until then `npm install` can't fetch them.

You need Node 22 or later, and no FlyCommerce account: everything runs against `@flycommerce/app-emulator`, which stands in for FlyCommerce, a store and the merchant's dashboard on your machine.

## 1. Install, and show a page

**Goal:** the app installs on a store, and its page shows inside the dashboard.

An app is a small web server. The dashboard shows its pages in a frame, and the store sends the merchant to it once, when they install it.

`app-config.json` names the app's pages. The developer portal reads it when you release a version; the dashboard lists each page in its menu:

```json
{
  "appId": "order-export",
  "versionId": 1,
  "version": "1.0.0",
  "quote": "Your orders, in a spreadsheet",
  "appUrl": "http://localhost:4000",
  "dashboard": {
    "pages": [{ "slug": "export", "label": "Export orders", "path": "/export" }]
  }
}
```

`src/server.ts` is the whole server: one table of routes, and `createApp()`, which turns the environment into the SDK's clients. Anything that isn't a route is a page, which `serveWebApp()` sends with the headers that let the dashboard frame it:

```ts
const routes: Record<string, Route> = {
  'GET /auth/callback': install,
};

export function createApp(env: NodeJS.ProcessEnv = process.env): App {
  const sealer = new Sealer(required(env, 'ENCRYPTION_KEY'));
  const credentials = new FileCredentialStore(env.CREDENTIALS_FILE ?? 'data/credentials.json', { sealer });
  const config = { ...appServerConfigFromEnv(env), credentials };
  const hub = new HubClient(config);

  return {
    config,
    appConfig: loadAppConfig('app-config.json', { appId: config.appId }),
    hub,
    store: new StoreApi(config, hub),
  };
}
```

When a merchant installs the app, the store sends them to `/auth/callback` with a one-time code. `src/install.ts` hands it to `handleInstall()`, which swaps the code for the store's credential, keeps it sealed on disk, and sends the merchant on to the app's page:

```ts
export const install: Route = async (app, _req, res, url) => {
  await handleInstall(url, res, {
    hub: app.hub,
    credentials: app.config.credentials,
    frameAncestors: app.config.frameAncestors,
    appName: 'Order Export',
  });
};
```

The page, `src/pages/ExportOrders.tsx`, is React with [`@flycommerce/ui`](https://ui.flycommerce.com), so it looks like the rest of the dashboard: a `DateRangePicker` with presets, and a **Download CSV** button. `useTitleBar()` puts its title in the dashboard's own title bar; outside the dashboard, it shows a `PageHeader` instead.

The build configuration (`package.json`, `tsconfig.json`, `vite.config.ts`, `src/pages/index.html`, `styles.css`) barely changes after this step (step 4 moves `@flycommerce/ui` to 0.3.1); copy it from the `order-export-step-1` tag.

Run it:

```bash
npm install
npm run dev
```

`src/dev.ts` starts the emulator, adds a month of orders to its store, installs the app, and starts an example dashboard. Open the address it prints, `http://127.0.0.1:4003/apps/export`. The page is there; **Download CSV** fails, because the server has nothing at `/api/export` yet.

## 2. Know who's asking

**Goal:** the button downloads a CSV file, and only the store's own dashboard can ask for one.

The page and the server are on different addresses, and anyone can call the server. So the page sends a **session token** with each call: `bridge.fetch()` from `@flycommerce/app-bridge` asks the dashboard for one and adds it as a bearer token. The token names the store and the user, and FlyCommerce signs it.

`src/session.ts` checks it. `authenticate()` verifies the signature, the app and the expiry; the store it names is the only one the request may touch. A store that has uninstalled the app has no credential any more, so it's refused too:

```ts
export async function whoIsAsking(app: App, req: IncomingMessage): Promise<DashboardSession> {
  const asking = await authenticate(req, app.config);

  if (!app.config.credentials.get(asking.store)) {
    throw new HttpError(403, 'not_installed', 'Order Export is not installed on this store.');
  }

  return asking;
}
```

Never take the store from the URL or the body: a merchant could edit those and read another store.

`src/export.ts` starts as the header row only, after the check:

```ts
const HEADER = ['Order', 'Placed', 'Customer', 'Email', 'Status', 'Total', 'Currency'];

export const exportOrders: Route = async (app, req, res) => {
  await whoIsAsking(app, req);

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="orders.csv"',
    'Cache-Control': 'no-store',
  });
  res.end(toCsv([HEADER]));
};
```

Add it to the route table as `'GET /api/export': exportOrders`.

`src/csv.ts` writes CSV that Excel and Google Sheets read safely. Cells with a comma, a quote or a line break are quoted. A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, because a spreadsheet would run it as a formula: a customer could name themselves `=HYPERLINK(...)`. The file starts with a byte-order mark, so Excel reads UTF-8 and a name like "Zoë" arrives intact.

On the page, the button turns the chosen days into a period from the start of the first day to the start of the day after the last, in the merchant's time zone, and saves the answer as a file:

```ts
const response = await bridge.fetch(`/api/export?${query}`);
if (!response.ok) {
  const body = await response.json().catch(() => ({}));
  throw new Error(body.message ?? 'The export failed. Try again.');
}

save(await response.blob(), `orders-${day(from)}-to-${day(last)}.csv`);
```

Click **Download CSV**: you get a file with one line, the header.

## 3. Read the orders

**Goal:** the file has every order placed in the period, oldest first.

The store's API lists orders a page at a time. `paginate()` from `@flycommerce/app-server` follows the pages for you, and stops asking when you stop reading:

```ts
const orders = app.store.asUser(asking).paginate<StoreOrder>('/api/v1/orders', {
  'filters[createdAt]': `>=${from.toISOString()}`,
  sort: 'createdAt',
  include: 'orderGroup',
});

for await (const order of orders) {
  if (Date.parse(order.createdAt) >= to.getTime()) break;
  rows.push(row(order));
}
```

Three things to notice:

- **`asUser(asking)`** calls the store as the person on the page, so the store applies their permissions. A team member who may not see orders gets the store's refusal, shown on the page as it is. (Jobs with no person behind them use `asApp(store)` instead.)
- **The date filter takes one bound.** So the app asks for every order since `from`, oldest first, and stops at the first one placed after `to`.
- **`include: 'orderGroup'`** brings the buyer's name and email, which live on the order group, not on the address.

`row()` copies each field as the store sends it. `total` is copied as is: the app never does arithmetic on money.

`period()` reads `from` and `to` from the URL and refuses a period that ends before it starts, with a message the page shows.

Click **Download CSV** again: one row per order, including the customers named `Sam O"Neil, Jr` and `=HYPERLINK(...)`, both kept as plain text.

## 4. Let the merchant choose

**Goal:** the merchant picks the columns for each export, and a Settings page keeps how the file is named and which columns are checked to start with.

`src/columns.ts` lists the columns once: a stable key, the header, and how to read the value from an order. `StoreOrder` moves here too. The server writes the file from this list, and the page draws its checkboxes from it:

```ts
export const COLUMNS: Column[] = [
  { key: 'order', header: 'Order', value: (order) => order.orderNo },
  { key: 'placed', header: 'Placed', value: (order) => order.createdAt },
  { key: 'customer', header: 'Customer', value: customerName },
  // email, status, total, currency
];
```

The page sends the chosen keys, `columns=order,placed,total`. `checkColumns()` in `src/settings.ts` accepts only keys from the list, refuses an empty choice, and answers the columns in the list's order, whatever order they were asked in:

```ts
export function checkColumns(keys: unknown): Column[] {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new HttpError(400, 'no_columns', 'Choose at least one column.');
  }
  if (keys.some((key) => !COLUMNS.some((column) => column.key === key))) {
    const known = COLUMNS.map((column) => column.key).join(', ');
    throw new HttpError(400, 'unknown_column', `Choose columns from: ${known}.`);
  }

  return COLUMNS.filter((column) => keys.includes(column.key));
}
```

`exportOrders` writes their headers as the first row and `columns.map((column) => column.value(order))` for each order. `HEADER` and `row()` are gone.

The settings are `GET /api/settings` and `PUT /api/settings`. Both start with `whoIsAsking()`, like every route: the store whose settings they touch comes from the session token, never the body. `src/data.ts` keeps every store's settings in one JSON file, `DATA_FILE`, and fills in the defaults for a store that hasn't saved any:

```ts
settings(store: string): Settings {
  return { ...DEFAULT_SETTINGS, ...this.read()[store] };
}
```

It writes a temporary file and renames it over the real one, so a crash mid-write never leaves half a file. Settings aren't secret, so unlike credentials they aren't sealed.

The file name format takes `{store}`, `{from}` and `{to}`; the default, `orders-{from}-to-{to}`, gives the same name as before. Only the page knows the merchant's time zone, so the page fills in the dates and adds `.csv`. The server checks the format before saving it: at most 100 characters, and only letters, digits, spaces, `-`, `_`, `.` and the placeholders. A `/` or a line break never reaches a file name, and the page replaces any other odd character, say in a store's name, with `-`.

Add `{ "slug": "settings", "label": "Settings", "path": "/settings" }` to `app-config.json`. The server sends the same bundle for every page, so `main.tsx` picks the component by `window.location.pathname`.

Run `npm run dev` again. On **Settings**, change the format and watch the preview, uncheck a column or two, and **Save**. Back on **Export orders**, those columns are checked, and the file you download is named after your format.

## Test it

`test/export.test.ts` runs the whole app against the emulator: the page is framed, the install keeps a credential, a request without this app's session token is refused, more than one page of orders comes back in order and is read as the user, awkward names stay text, and a backwards period is refused. Then the choices: only the chosen columns are written, in the list's order; unknown columns and unsafe file name formats are refused; and one store never sees another's settings.

```bash
npm test
```

## Next

- **Run it on a real store:** the README's last section.
- **Change it:** `AGENTS.md` has recipes for adding a column, filtering orders and exporting products.
- **React to the store:** an app that acts when something happens, such as a new order, subscribes to webhooks. The [Building apps](https://developers.flycommerce.com/docs/apps) guide explains how.
