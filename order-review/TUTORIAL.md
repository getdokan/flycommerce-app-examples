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
