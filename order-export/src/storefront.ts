import fs from 'node:fs/promises';
import type { Route } from './server.js';

export const welcomeScript: Route = async (_app, _req, res) => {
  const script = await fs.readFile('storefront/welcome.js');

  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(script);
};
