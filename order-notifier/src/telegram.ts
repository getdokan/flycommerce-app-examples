export interface TelegramMessageOptions {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  apiBaseUrl?: string;
}

export interface TelegramResult {
  ok: boolean;
  description?: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price?: number | string;
}

export interface OrderPayload {
  id?: number | string;
  orderNo?: number | string;
  order_number?: number | string;
  total?: number | string;
  currency?: string;
  status?: string;
  customerName?: string;
  customerEmail?: string;
  items?: OrderItem[];
  orderGroup?: {
    currency?: string;
    customerInfo?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    };
  };
}

export function formatOrderAlert(
  order: OrderPayload,
  store: string,
  options: { includeCustomerInfo?: boolean } = {}
): string {
  const orderNumber = order.orderNo ?? order.order_number ?? order.id ?? 'Unknown';
  const total = order.total ?? '0.00';
  const currency = order.orderGroup?.currency ?? order.currency ?? 'USD';
  const status = order.status ?? 'placed';

  const customerFirst = order.orderGroup?.customerInfo?.firstName ?? '';
  const customerLast = order.orderGroup?.customerInfo?.lastName ?? '';
  const customerEmail = order.orderGroup?.customerInfo?.email ?? order.customerEmail ?? '';
  const customerFullName = [customerFirst, customerLast].filter(Boolean).join(' ') || order.customerName || 'Guest';

  const lines = [
    '🛍️ <b>New Order Placed!</b>',
    '',
    `<b>Order:</b> #${orderNumber}`,
    `<b>Store:</b> ${store}`,
    `<b>Total:</b> ${total} ${currency}`,
    `<b>Status:</b> ${status}`,
  ];

  if (options.includeCustomerInfo !== false) {
    lines.push(`<b>Customer:</b> ${customerFullName}${customerEmail ? ` (${customerEmail})` : ''}`);
  }

  return lines.join('\n');
}

export async function sendTelegramMessage(options: TelegramMessageOptions): Promise<TelegramResult> {
  const baseUrl = options.apiBaseUrl ?? 'https://api.telegram.org';
  const url = `${baseUrl}/bot${options.botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.chatId,
      text: options.text,
      parse_mode: options.parseMode ?? 'HTML',
    }),
  });

  const body = (await response.json().catch(() => ({}))) as TelegramResult;

  if (!response.ok || !body.ok) {
    return {
      ok: false,
      description: body.description ?? `Telegram API returned status ${response.status}`,
    };
  }

  return { ok: true };
}
