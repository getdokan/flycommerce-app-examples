import {
  HttpError,
  type ShopperRequest,
  type StoreClient,
  StoreApiError,
  allowStorefrontCalls,
  authenticateShopper,
  json,
  readJson,
} from '@flycommerce/app-server';
import { type OrderLine, shopperOrders } from './orders.js';
import { type ProductCard, findProducts } from './search.js';
import type { Route } from './server.js';

/** What the bubble shows: words, and product cards or orders when there are some. */
export interface Reply {
  text: string;
  products?: ProductCard[];
  orders?: OrderLine[];
  suggestions?: string[];
}

const SUGGESTIONS = ['green tea', 'mugs under 15', "where's my order?"];
const GREETING = /^(hi|hello|hey|help|\?)\W*$/i;
const ORDER_QUESTION = /\b(my orders?|order status|where('?s| is) my|track(ing)?|delivery|deliver(ed)?|shipped)\b/i;

export const chat: Route = async (app, req, res) => {
  if (allowStorefrontCalls(req, res)) return;

  // FlyCommerce: who is shopping comes only from the verified shopper token, never from the message — https://developers.flycommerce.com/docs/apps
  const shopper = await authenticateShopper(req, app.config);

  if (!app.config.credentials.get(shopper.store)) {
    throw new HttpError(403, 'not_installed', 'Shopping Assistant is not installed on this store.');
  }

  const { message } = await readJson<{ message?: unknown }>(req);

  if (typeof message !== 'string' || !message.trim() || message.length > 300) {
    throw new HttpError(422, 'bad_message', 'Ask in up to 300 characters.');
  }

  json(res, 200, await reply(message.trim(), app.store.asApp(shopper.store), shopper));
};

export async function reply(message: string, store: StoreClient, shopper: ShopperRequest): Promise<Reply> {
  if (GREETING.test(message)) {
    return { text: 'I can find products for you and check on your orders. Try:', suggestions: SUGGESTIONS };
  }

  try {
    return ORDER_QUESTION.test(message) ? await shopperOrders(store, shopper) : await findProducts(store, message);
  } catch (error) {
    // The merchant may not have granted what a question needs; say so rather than fail.
    if (error instanceof StoreApiError && error.upstreamStatus === 403) {
      return { text: "This store hasn't let me look that up." };
    }
    throw error;
  }
}
