import { toCsv } from './csv.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';

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
