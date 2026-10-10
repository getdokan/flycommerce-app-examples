import type { ShopperRequest, StoreClient } from '@flycommerce/app-server';
import type { Reply } from './chat.js';

/** One of the shopper's orders, as the bubble lists it. */
export interface OrderLine {
  orderNo: number;
  status: string;
  total: string;
  placedOn: string;
}

interface StoreOrder {
  orderNo: number;
  status: string;
  total: number | string;
  createdAt: string;
  orderGroup?: { currency?: string };
}

export async function shopperOrders(store: StoreClient, shopper: ShopperRequest): Promise<Reply> {
  if (!shopper.signedIn) {
    return { text: 'Sign in to your account and ask me again: I can only see orders for a signed-in customer.' };
  }

  // signed_in without an id: the merchant didn't grant storefront.customer, so the app can't tell whose orders.
  if (shopper.customerId === null) {
    return { text: "This store hasn't let me see who you are. Your orders are on your account page." };
  }

  // As the app, filtered to this customer: the app's job is to show a shopper only their own orders.
  const { data } = await store.get<{ data: StoreOrder[] }>('/api/v1/orders', {
    'filters[customerId]': shopper.customerId,
    sort: '-createdAt',
    include: 'orderGroup',
    limit: 3,
  });

  if (data.length === 0) {
    return { text: "You haven't ordered from this store yet." };
  }

  return {
    text: data.length === 1 ? 'Your order:' : `Your last ${data.length} orders:`,
    orders: data.map((order) => ({
      orderNo: order.orderNo,
      status: order.status.replace('_', ' '),
      total: `${Number(order.total).toFixed(2)}${order.orderGroup?.currency ? ` ${order.orderGroup.currency}` : ''}`,
      placedOn: new Date(order.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    })),
  };
}
