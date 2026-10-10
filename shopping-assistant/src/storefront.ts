import fs from 'node:fs/promises';
import type { Route } from './server.js';

// The script needs to know which app it is (for its shopper token) and where its server is; nothing else is filled in.
export const assistantScript: Route = async (app, _req, res) => {
  const script = (await fs.readFile('storefront/assistant.js', 'utf8'))
    .replace('__APP_ID__', JSON.stringify(app.config.appId))
    .replace('__APP_URL__', JSON.stringify(app.config.appUrl ?? ''));

  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(script);
};
