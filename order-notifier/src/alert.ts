/** The fields of a store order the alert shows, as `GET /api/v1/orders/{id}?include=orderGroup` returns them. */
export interface StoreOrder {
  orderNo: number;
  status: string;
  total: number;
  orderGroup?: {
    currency: string;
    customerInfo?: { firstName: string | null; lastName: string | null; email: string | null };
  };
}

export function orderAlert(order: StoreOrder, store: string, options: { includeCustomerInfo: boolean }): string {
  const lines = [
    '🛍️ <b>New order</b>',
    '',
    `<b>Order:</b> #${order.orderNo}`,
    `<b>Store:</b> ${escape(store)}`,
    `<b>Total:</b> ${escape(`${order.total} ${order.orderGroup?.currency ?? ''}`.trim())}`,
    `<b>Status:</b> ${escape(order.status)}`,
  ];

  const customer = order.orderGroup?.customerInfo;
  if (options.includeCustomerInfo && customer) {
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Guest';
    lines.push(`<b>Customer:</b> ${escape(name)}${customer.email ? ` (${escape(customer.email)})` : ''}`);
  }

  return lines.join('\n');
}

export function testAlert(store: string): string {
  return `🔔 <b>Test alert</b>\n\nOrder Notifier is connected to <b>${escape(store)}</b>.`;
}

// Telegram's HTML mode refuses the whole message on a stray < or &, so every value from the store is escaped.
function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
