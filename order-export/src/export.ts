import { HttpError } from '@flycommerce/app-server';
import { toCsv } from './csv.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';

/** The fields of a store order this app exports. The store sends more. */
export interface StoreOrder {
  orderNo: number;
  createdAt: string;
  status: string;
  total: number;
  orderGroup?: {
    currency: string;
    customerInfo?: { firstName: string | null; lastName: string | null; email: string | null };
  };
}

const HEADER = ['Order', 'Placed', 'Customer', 'Email', 'Status', 'Total', 'Currency'];

export const exportOrders: Route = async (app, req, res, url) => {
  const asking = await whoIsAsking(app, req);
  const { from, to } = period(url);
  const rows: unknown[][] = [HEADER];

  // FlyCommerce: as the user, the store decides whether this person may see orders — https://developers.flycommerce.com/docs/apps
  const orders = app.store.asUser(asking).paginate<StoreOrder>('/api/v1/orders', {
    // The store filters on one bound, so ask for everything since `from`, oldest first, and stop at `to`.
    'filters[createdAt]': `>=${from.toISOString()}`,
    sort: 'createdAt',
    include: 'orderGroup',
  });

  for await (const order of orders) {
    if (Date.parse(order.createdAt) >= to.getTime()) break;
    rows.push(row(order));
  }

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="orders.csv"',
    'Cache-Control': 'no-store',
  });
  res.end(toCsv(rows));
};

function row(order: StoreOrder): unknown[] {
  const customer = order.orderGroup?.customerInfo;
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');

  return [order.orderNo, order.createdAt, name, customer?.email, order.status, order.total, order.orderGroup?.currency];
}

function period(url: URL): { from: Date; to: Date } {
  const from = new Date(url.searchParams.get('from') ?? '');
  const to = new Date(url.searchParams.get('to') ?? '');

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new HttpError(400, 'bad_period', 'Choose a start date on or before the end date.');
  }

  return { from, to };
}
