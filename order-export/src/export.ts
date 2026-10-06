import { HttpError } from '@flycommerce/app-server';
import type { StoreOrder } from './columns.js';
import { toCsv } from './csv.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';
import { checkColumns } from './settings.js';

export const exportOrders: Route = async (app, req, res, url) => {
  const asking = await whoIsAsking(app, req);
  const { from, to } = period(url);
  const columns = checkColumns(url.searchParams.get('columns')?.split(',').filter(Boolean));
  const rows: unknown[][] = [columns.map((column) => column.header)];

  // FlyCommerce: as the user, the store decides whether this person may see orders — https://developers.flycommerce.com/docs/apps
  const orders = app.store.asUser(asking).paginate<StoreOrder>('/api/v1/orders', {
    // The store filters on one bound, so ask for everything since `from`, oldest first, and stop at `to`.
    'filters[createdAt]': `>=${from.toISOString()}`,
    sort: 'createdAt',
    include: 'orderGroup',
  });

  for await (const order of orders) {
    if (Date.parse(order.createdAt) >= to.getTime()) break;
    rows.push(columns.map((column) => column.value(order)));
  }

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="orders.csv"',
    'Cache-Control': 'no-store',
  });
  res.end(toCsv(rows));
};

function period(url: URL): { from: Date; to: Date } {
  const from = new Date(url.searchParams.get('from') ?? '');
  const to = new Date(url.searchParams.get('to') ?? '');

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new HttpError(400, 'bad_period', 'Choose a start date on or before the end date.');
  }

  return { from, to };
}
