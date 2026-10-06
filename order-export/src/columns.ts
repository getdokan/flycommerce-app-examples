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

export interface Column {
  key: string;
  header: string;
  value(order: StoreOrder): unknown;
}

// The file always has its columns in this order, whatever order they were chosen in.
export const COLUMNS: Column[] = [
  { key: 'order', header: 'Order', value: (order) => order.orderNo },
  { key: 'placed', header: 'Placed', value: (order) => order.createdAt },
  { key: 'customer', header: 'Customer', value: customerName },
  { key: 'email', header: 'Email', value: (order) => order.orderGroup?.customerInfo?.email },
  { key: 'status', header: 'Status', value: (order) => order.status },
  { key: 'total', header: 'Total', value: (order) => order.total },
  { key: 'currency', header: 'Currency', value: (order) => order.orderGroup?.currency },
];

function customerName(order: StoreOrder): string {
  const customer = order.orderGroup?.customerInfo;
  return [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');
}
