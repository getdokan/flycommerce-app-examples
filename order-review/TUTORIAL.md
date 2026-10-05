# Build your first FlyCommerce app

In seven steps you'll build **Order Review**: orders above a limit the merchant sets wait in a Review queue inside their dashboard, where the merchant holds or releases them. Along the way you'll use every part of the platform an app needs: dashboard pages, session tokens, the store API as the user and as the app, installs, webhooks and a background job.

Each step is one commit, tagged `order-review-step-1` to `order-review-step-7`. To see the code after any step, run `git checkout order-review-step-3`. A file appears in full the first time; after that, the tutorial shows only what changes.

> **Preview.** The SDK packages arrive on npm with FlyCommerce's app platform launch; until then `npm install` can't fetch them.

You need Node 22 or later, and no FlyCommerce account: everything runs against `@flycommerce/app-emulator`, which stands in for FlyCommerce, a store and the merchant dashboard on your machine. Each step links the part of the [Building apps](https://developers.flycommerce.com/docs/apps) guide it puts to work.

## 1. Run it

**Goal:** an empty Review queue page, served by your app inside the example dashboard.

The dashboard shows your pages in a frame, so an app starts as a server that serves them with the right framing headers: `serveWebApp()` from `@flycommerce/app-server`.

`package.json`

```json
{
  "name": "order-review",
  "version": "1.0.0",
  "private": true,
  "description": "Hold big orders until you've checked them: a FlyCommerce example app.",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "vite build && tsx src/dev.ts",
    "build": "tsc && vite build",
    "start": "node dist/server.js",
    "test": "vite build && node --import tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@flycommerce/app-bridge": "^0.1.0",
    "@flycommerce/app-server": "^0.1.0",
    "@flycommerce/ui": "^0.2.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@flycommerce/app-emulator": "^0.1.0",
    "@tailwindcss/vite": "^4.3.3",
    "@types/node": "^22.20.5",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^6.1.2",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.23.15",
    "typescript": "^5.9.3",
    "vite": "^8.3.2"
  },
  "prettier": {
    "singleQuote": true,
    "printWidth": 120,
    "trailingComma": "es5"
  }
}
```

`app-config.json` lists the pages your app adds to the dashboard. You upload the same file in the developer portal when you release a version.

`app-config.json`

```json
{
  "appId": "order-review",
  "versionId": 1,
  "version": "1.0.0",
  "quote": "Hold big orders until you've checked them",
  "appUrl": "http://localhost:4000",
  "dashboard": {
    "pages": [{ "slug": "queue", "label": "Review queue", "path": "/queue" }]
  }
}
```

Every route lives in one table in `server.ts`. It's empty for now; anything else falls through to the pages.

`src/server.ts`

```ts
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type AppConfig,
  type AppServerConfig,
  appServerConfigFromEnv,
  json,
  loadAppConfig,
  loadEnvFile,
  sendError,
  serveWebApp,
} from '@flycommerce/app-server';

export interface App {
  config: AppServerConfig;
  appConfig: AppConfig;
}

export type Route = (app: App, req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

const routes: Record<string, Route> = {};

export function createApp(env: NodeJS.ProcessEnv = process.env): App {
  const config = appServerConfigFromEnv(env);

  return {
    config,
    appConfig: loadAppConfig('app-config.json', { appId: config.appId }),
  };
}

export async function startServer(app: App, port: number): Promise<{ url: string; close(): Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) return await route(app, req, res, url);

      const page = {
        root: 'dist/pages',
        appId: app.config.appId,
        config: app.appConfig,
        frameAncestors: app.config.frameAncestors,
      };
      if (await serveWebApp(req.method, url.pathname, res, page)) return;

      json(res, 404, { error: 'not_found' });
    } catch (error) {
      sendError(res, error, 'order-review');
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.filename === process.argv[1]) {
  loadEnvFile();
  const app = createApp();
  const server = await startServer(app, Number(process.env.PORT ?? 4000));
  console.log(`Order Review is listening on ${server.url}`);
}
```

The page is built with [`@flycommerce/ui`](https://ui.flycommerce.com), so it looks like the dashboard. `useTitleBar` puts the title in the dashboard's own header; opened on its own, the page shows a `PageHeader` instead. Until there are orders, an `Empty` state with the `orders` icon fills the card.

`src/pages/main.tsx`

```tsx
import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { appIdFromPage } from '@flycommerce/app-bridge';
import { AppBridgeProvider } from '@flycommerce/app-bridge/react';
import { ReviewQueue } from './ReviewQueue';
import './styles.css';

// One component per page in app-config.json; the server sends this same bundle for each page's path.
const pages: Record<string, ComponentType> = { '/queue': ReviewQueue };
const Page = pages[window.location.pathname] ?? ReviewQueue;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBridgeProvider appId={appIdFromPage()}>
      <Page />
    </AppBridgeProvider>
  </StrictMode>
);
```

`src/pages/ReviewQueue.tsx`

```tsx
import { useTitleBar } from '@flycommerce/app-bridge/react';
import {
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Icon,
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@flycommerce/ui';

const TITLE = 'Review queue';
const DESCRIPTION = 'Orders over your limit wait here until you have checked them.';

export function ReviewQueue() {
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });

  return (
    <main className="flex min-w-0 flex-col gap-4 p-1">
      {!embedded && (
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>{TITLE}</PageHeaderTitle>
            <PageHeaderDescription>{DESCRIPTION}</PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
      )}
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon name="orders" />
            </EmptyMedia>
            <EmptyTitle>Nothing to check</EmptyTitle>
            <EmptyDescription>New orders over your limit will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    </main>
  );
}
```

`npm run dev` starts the emulator, the example dashboard and your app:

`src/dev.ts`

```ts
import crypto from 'node:crypto';
import { ExampleDashboard, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from './server.js';

const PORTS = { app: 4000, hub: 4001, store: 4002, dashboard: 4003 };
const STORE = 'demo.flycom.shop';
const appUrl = `http://localhost:${PORTS.app}`;
const { appId, dashboard } = loadAppConfig('app-config.json');

const registration = {
  appId,
  appSecret: crypto.randomBytes(24).toString('hex'),
  redirectUri: `${appUrl}/auth/callback`,
};
const platform = await startFakePlatform(registration, PORTS);

const app = createApp({ ...platform.env, FRAME_ANCESTORS: `http://127.0.0.1:${PORTS.dashboard}` });
const server = await startServer(app, PORTS.app);

const dashboardServer = await ExampleDashboard.start({
  hub: platform.hub,
  appId,
  appName: 'Order Review',
  appUrl,
  store: STORE,
  pages: dashboard.pages,
  port: PORTS.dashboard,
});

console.log(`
  Order Review is running for ${STORE}.

  Dashboard   ${dashboardServer.url}/apps/queue
`);

process.on('SIGINT', async () => {
  await Promise.all([dashboardServer.close(), server.close()]);
  await platform.close();
  process.exit(0);
});
```

The rest is standard build configuration, unchanged from here on; copy it from the `order-review-step-1` tag: `tsconfig.json` (the server, compiled to `dist/`), `vite.config.ts` (the pages, built from `src/pages` to `dist/pages`), and in `src/pages/` an `index.html`, a `tsconfig.json` for the browser, and `styles.css`, which imports Tailwind and `@flycommerce/ui`'s theme.

The journey test starts the emulator and the app on a free port. Each step adds to it.

`test/journey.test.ts`

```ts
import assert from 'node:assert/strict';
import net, { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { type FakePlatform, startFakePlatform } from '@flycommerce/app-emulator';
import { loadAppConfig } from '@flycommerce/app-server';
import { createApp, startServer } from '../src/server.js';

const APP_ID = loadAppConfig('app-config.json').appId;

let platform: FakePlatform;
let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  const port = await freePort();
  const appUrl = `http://localhost:${port}`;

  platform = await startFakePlatform({
    appId: APP_ID,
    appSecret: 'test-secret',
    redirectUri: `${appUrl}/auth/callback`,
  });
  server = await startServer(createApp(platform.env), port);
});

after(async () => {
  await server.close();
  await platform.close();
});

test('serves its pages for the dashboard to frame', async () => {
  const response = await fetch(`${server.url}/queue`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /^frame-ancestors /);
  assert.ok(html.includes(`<meta name="flycom-app-id" content="${APP_ID}">`));

  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.equal((await fetch(`${server.url}${script}`)).status, 200);
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
```

**You should now see** the empty Review queue at http://127.0.0.1:4003/apps/queue after `npm install` and `npm run dev`, and `npm test` passes.

Read more: [Building apps › Your pages in the dashboard](https://developers.flycommerce.com/docs/apps).

## 2. Know who's asking

**Goal:** the page greets the user and names their store, and the server trusts nothing it hasn't verified.

Your page has no cookie session with your server. For every request it asks the dashboard for a **session token**, a 60-second JWT signed by FlyCommerce that names the store and the user. `authenticate()` verifies it; the store is taken from it and never from the request.

`src/session.ts`

```ts
import type { IncomingMessage } from 'node:http';
import { type DashboardSession, authenticate, json } from '@flycommerce/app-server';
import type { Route, App } from './server.js';

// FlyCommerce: verify the session token, then trust only its store — https://developers.flycommerce.com/docs/apps
export async function whoIsAsking(app: App, req: IncomingMessage): Promise<DashboardSession> {
  return authenticate(req, app.config);
}

export const showMe: Route = async (app, req, res) => {
  const { store, session } = await whoIsAsking(app, req);
  json(res, 200, { store, userId: session.sub, role: session.user_role });
};
```

In `src/server.ts`:

```ts
const routes: Record<string, Route> = {
  'GET /api/me': showMe,
};
```

On the page, `bridge.fetch()` attaches a fresh session token. This hook wraps it and throws the server's message when it refuses:

`src/pages/api.ts`

```ts
import { useCallback } from 'react';
import { useAppBridge } from '@flycommerce/app-bridge/react';

/** Calls this app's own server with a fresh session token, and throws the server's message when it refuses. */
export function useApi() {
  const bridge = useAppBridge();

  return useCallback(
    async <T>(path: string, send?: { method: 'POST' | 'PUT'; body: unknown }): Promise<T> => {
      const init = send && {
        method: send.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(send.body),
      };
      const response = await bridge.fetch(path, init);
      const body = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(body.message ?? 'Something went wrong. Try again.');
      return body as T;
    },
    [bridge]
  );
}
```

`ReviewQueue.tsx` calls `api<Me>('/api/me')` in a `useEffect` and greets the user with `me.userId`, `me.role` and `me.store`. The test checks that a token for this app works, and that no token, or a token for another app, gets a `401`.

**You should now see** "Signed in as user 1 (owner) on demo.flycom.shop." Switch the dashboard's **Role** to `admin` and it says user 2.

Read more: [Building apps › Know who is asking: session tokens](https://developers.flycommerce.com/docs/apps).

## 3. Read orders

**Goal:** the page lists the store's latest orders, read from the store API **as the user** who opened it.

**As the user**, your server trades the page's session token at the store for 15 minutes of access, and the store allows only what both your app and that user may do. (**As the app** comes in step 5.) `StoreApi` does both and caches the tokens. Relations are opt-in, so `include=orderGroup` asks for the currency.

`src/orders.ts`

```ts
import { json } from '@flycommerce/app-server';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';

/** The fields of a store order this app uses. The store sends more. */
export interface StoreOrder {
  id: string;
  orderNo: number;
  status: string;
  total: number;
  createdAt: string;
  orderGroup?: { currency: string };
}

// FlyCommerce: as the user, the store decides what this user may do — https://developers.flycommerce.com/docs/apps
export const showQueue: Route = async (app, req, res) => {
  const asking = await whoIsAsking(app, req);
  const { data: orders } = await app.store
    .asUser(asking)
    .get<{ data: StoreOrder[] }>('/api/v1/orders', { include: 'orderGroup', limit: 50 });

  json(res, 200, { orders });
};
```

In `src/server.ts`, add `'GET /api/queue': showQueue` to the routes, and give the app a `HubClient` (FlyCommerce's token endpoint) and a `StoreApi`:

```ts
  const config = appServerConfigFromEnv(env);
  const hub = new HubClient(config);

  return {
    config,
    appConfig: loadAppConfig('app-config.json', { appId: config.appId }),
    hub,
    store: new StoreApi(config, hub),
  };
```

The store lets an app act for its users only once the merchant has approved the install, so `src/dev.ts` seeds five orders dated two days back, from before the install, and approves it with `platform.hub.install(appId, { store: STORE, scopes: SCOPES })`.

`ReviewQueue.tsx` loads the orders after `/api/me` and lists them in a `DataTable`, which brings the loading, error and empty states, and scrolls inside its card on a phone. The columns are TanStack `ColumnDef`s; dates and money follow the dashboard's language from `useDashboardContext()?.locale`:

```tsx
const columns: ColumnDef<StoreOrder>[] = [
  { accessorKey: 'orderNo', header: 'Order', cell: ({ row }) => `#${row.original.orderNo}` },
```

```tsx
<DataTable
  columns={columns}
  data={orders ?? []}
  getRowId={(order) => order.id}
  loading={orders === null && !loadError}
  error={loadError ?? undefined}
```

The `Empty` state from step 1 moves into its `empty` prop.

The test checks that the store saw the call as user 1: `platform.store.requests.at(-1)?.userId` is `'1'`.

**You should now see** all five seeded orders: there's no rule yet.

Read more: [Building apps › Call the store API](https://developers.flycommerce.com/docs/apps).

## 4. The rule

**Goal:** only orders over the merchant's limit show, and the merchant sets the limit on a Settings page.

The rule is one pure function, easy to find and change:

`src/rule.ts`

```ts
/** An order needs a person to check it when its total is above the store's limit. */
export function needsReview(total: number | string, limit: number): boolean {
  return Number(total) > limit;
}
```

The limit belongs to a store. `data.ts` keeps everything per store in one JSON file, written atomically: enough for one instance.

`src/data.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LIMIT = 500;

interface StoreData {
  limit: number;
}

/** Everything the app keeps, per store, in one JSON file. */
export class Data {
  constructor(private readonly file: string) {}

  limit(store: string): number {
    return this.read()[store]?.limit ?? DEFAULT_LIMIT;
  }

  setLimit(store: string, limit: number): void {
    this.update(store, (data) => (data.limit = limit));
  }

  private update(store: string, change: (data: StoreData) => unknown): void {
    const all = this.read();
    const data = all[store] ?? { limit: DEFAULT_LIMIT };
    change(data);
    all[store] = data;
    this.write(all);
  }

  private read(): Record<string, StoreData> {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  // Written beside the file and renamed over it, so a crash mid-write never leaves half a file.
  private write(all: Record<string, StoreData>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(all, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
```

`settings.ts` reads and saves the limit. The store can't check an app-side decision, so the app checks the role itself. It also sends the currency the limit is in, for the field's addon:

`src/settings.ts`

```ts
import { HttpError, json, readJson } from '@flycommerce/app-server';
import type { StoreOrder } from './orders.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';

const ROLES_THAT_CHANGE_SETTINGS = ['owner', 'admin'];

export const showSettings: Route = async (app, req, res) => {
  const asking = await whoIsAsking(app, req);
  // Apps can't read the store's currency, so use the latest order's: the one totals are compared in.
  const { data: latest } = await app.store
    .asUser(asking)
    .get<{ data: StoreOrder[] }>('/api/v1/orders', { include: 'orderGroup', limit: 1 });

  json(res, 200, { limit: app.data.limit(asking.store), currency: latest[0]?.orderGroup?.currency ?? null });
};

export const saveSettings: Route = async (app, req, res) => {
  const { store, session } = await whoIsAsking(app, req);
  const { limit } = await readJson<{ limit?: unknown }>(req);

  // A role FlyCommerce adds later gets the least access until this list names it.
  if (!ROLES_THAT_CHANGE_SETTINGS.includes(session.user_role)) {
    throw new HttpError(403, 'not_allowed', 'Only the store owner or an admin can change this.');
  }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) {
    throw new HttpError(422, 'invalid_limit', 'The limit must be a number, 0 or more.');
  }

  app.data.setLimit(store, limit);
  json(res, 200, { limit });
};
```

In `src/server.ts`, add `data: new Data(env.DATA_FILE ?? 'data/order-review.json')` to the app and two routes, `'GET /api/settings': showSettings` and `'PUT /api/settings': saveSettings`. Then apply the rule in `showQueue`:

```ts
const limit = app.data.limit(asking.store);

json(res, 200, { orders: orders.filter((order) => needsReview(order.total, limit)) });
```

The Settings page goes in `app-config.json`, as `{ "slug": "settings", "label": "Settings", "path": "/settings" }`, so the sidebar shows it, and in `pages` in `src/pages/main.tsx` as `'/settings': Settings`.

The page is a `Field` around an `InputGroup`, with the currency as an `InputGroupAddon`:

`src/pages/Settings.tsx`

```tsx
import { type FormEvent, useEffect, useState } from 'react';
import { useAppBridge, useTitleBar } from '@flycommerce/app-bridge/react';
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from '@flycommerce/ui';
import { useApi } from './api';

export function Settings() {
  const api = useApi();
  const bridge = useAppBridge();
  const [limit, setLimit] = useState('');
  const [currency, setCurrency] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { embedded } = useTitleBar({ title: 'Settings' });

  useEffect(() => {
    api<{ limit: number; currency: string | null }>('/api/settings')
      .then((body) => {
        setLimit(String(body.limit));
        setCurrency(body.currency);
      })
      .catch((failure: Error) => setError(failure.message));
  }, [api]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('/api/settings', { method: 'PUT', body: { limit: Number(limit) } });
      setError(null);
      bridge.toast('Limit saved', { type: 'success' }).catch(() => {});
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <main className="flex max-w-xl min-w-0 flex-col gap-4 p-1">
      {!embedded && (
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>Settings</PageHeaderTitle>
          </PageHeaderContent>
        </PageHeader>
      )}
      <Card>
        <CardContent>
          <form onSubmit={save} className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="limit">Review limit</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="limit"
                  type="number"
                  min={0}
                  step="0.01"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
                {currency && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>{currency}</InputGroupText>
                  </InputGroupAddon>
                )}
              </InputGroup>
              <FieldDescription>New orders with a total above this amount wait in the Review queue.</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Button type="submit" disabled={limit === ''} className="justify-self-start">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

A title-bar action on the Review queue opens it with `bridge.openPage('settings')`. `src/dev.ts` passes the app a `DATA_FILE` and empties it on each start, since the emulator forgets everything when it stops. The test now sets a limit of 1000 and expects only the 1,500 order.

**You should now see** two orders, 1,250 and 640, because the limit starts at 500. Set it to 1000 and one remains.

Read more: [Building apps › Store data and secrets](https://developers.flycommerce.com/docs/apps).

## 5. React to new orders

**Goal:** when a big order is placed, the store tells the app and the order lands in the queue, with nobody on the page.

Two things happen here. **The install:** when a merchant approves your app, FlyCommerce sends them to your install URL with a one-time code, and `handleInstall()` trades it for **that store's credential**. **Webhooks:** with that credential the app acts **as the app** and subscribes to `order.created`. `onInstalled` runs before the merchant is sent back, so the subscription exists by the time they land on your page. `reconcileWebhook()` replaces any old subscription for the same endpoint, since a secret is shown only once.

`src/install.ts`

```ts
import { handleInstall, reconcileWebhook } from '@flycommerce/app-server';
import type { App, Route } from './server.js';

export const install: Route = async (app, _req, res, url) => {
  await handleInstall(url, res, {
    hub: app.hub,
    credentials: app.config.credentials,
    frameAncestors: app.config.frameAncestors,
    appName: 'Order Review',
    onInstalled: async (store) => {
      app.data.add(store);
      await subscribeToOrders(app, store);
    },
  });
};

// FlyCommerce: an app subscribes to webhooks itself, as the app — https://developers.flycommerce.com/docs/apps
export async function subscribeToOrders(app: App, store: string): Promise<void> {
  const endpoint = new URL(`/webhooks/order-created?store=${encodeURIComponent(store)}`, app.url).toString();
  const subscription = { endpoint, events: ['order.created'], description: 'Order Review' };
  const { secret } = await reconcileWebhook(app.store.asApp(store), subscription);

  app.data.setWebhookSecret(store, secret);
}
```

A delivery doesn't name its store, so each store has its own endpoint, and the app trusts the store in it only once that store's secret verifies the signature. `readWebhook()` reads the store from `?store=`, checks the signature on the **raw body** before anything is parsed, and answers an unknown store and a bad signature with the same `401`. The body is a `WebhookDelivery`: `{ event, timestamp, data }`, where `data` is the order as the store keeps it, with `total` as a decimal string. Deliveries carry no ID, so the queue remembers every order it has queued and a repeat changes nothing.

`src/webhooks.ts`

```ts
import { json, readWebhook } from '@flycommerce/app-server';
import { needsReview } from './rule.js';
import type { Route } from './server.js';

// The order as the store keeps it, not as the API returns it: money is a decimal string.
interface StoredOrder {
  id: string;
  total: string;
}

// FlyCommerce: the store in the URL is trusted only because the body verifies under its secret — https://developers.flycommerce.com/docs/apps
export const orderCreated: Route = async (app, req, res) => {
  const { store, delivery } = await readWebhook<StoredOrder>(req, (store) => app.data.webhookSecret(store));
  const order = delivery.data;
  const queued = needsReview(order.total, app.data.limit(store)) && app.data.enqueue(store, order.id);

  json(res, 200, { queued });
};
```

`data.ts` now keeps each store's webhook secret, sealed with the SDK's `Sealer`, and its queue: `queue`, and `seen`, every order ever queued, which makes a repeated delivery harmless:

`enqueue(store, id)` adds an order only if `seen` doesn't have it yet, and says whether it did. The rest is small: `add()`, `webhookSecret()`, `setWebhookSecret()`, `queue()` and `dequeue()`.

The Review queue now shows the queued orders instead of the latest 50. In `src/orders.ts`, `showQueue` reads each one as the user with `GET /api/v1/orders/{id}?include=orderGroup`, and drops one the store answers `404` for: it was deleted, so there's nothing left to review.

In `src/server.ts`, the two routes join the table (`'GET /auth/callback': install` and `'POST /webhooks/order-created': orderCreated`), the store credentials are kept sealed by the SDK's `FileCredentialStore`, and the app learns its own URL for the webhook endpoint:

```ts
  const sealer = new Sealer(required(env, 'ENCRYPTION_KEY'));
  const credentials = new FileCredentialStore(env.CREDENTIALS_FILE ?? 'data/credentials.json', { sealer });
  const config = { ...appServerConfigFromEnv(env), credentials };
```

`src/dev.ts` completes the install the way a merchant would, and serves a **Simulate** page at http://127.0.0.1:4004 with a button for each action:

```ts
// The merchant approves the install in the app store, and FlyCommerce sends them to the app's install URL.
const { callbackUrl } = platform.hub.install(appId, { store: STORE, scopes: SCOPES });
await fetch(callbackUrl, { redirect: 'manual' });

const placeOrder = async (total: number) => {
  const order = store.addOrder({ total });
  const [delivery] = await platform.store.deliver(STORE, 'order.created', FakeStore.rawOrder(order));
  const answer = delivery?.status ?? 'nothing: no active subscription';
  return `Order #${order.orderNo} for ${total} placed; order.created answered ${answer}.`;
};
```

The emulator's store signs and delivers `order.created` the way a real store does, so the tests use it as is: `placeOrder()` adds an order and calls `platform.store.deliver(STORE, 'order.created', FakeStore.rawOrder(order))`. Three new tests check that the install subscribed, that a big order is queued and a small one isn't, and that a repeated delivery queues once while a forged one gets a `401`.

**You should now see** an empty queue: the seeded orders came before the install. On the Simulate page, **Place a big order** and reload the Review queue; **Place an order** under the limit and nothing changes.

Read more: [Building apps › Install: exchange the code](https://developers.flycommerce.com/docs/apps) and [Receive webhooks](https://developers.flycommerce.com/docs/apps).
