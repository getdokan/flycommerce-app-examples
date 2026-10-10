import type { StoreClient } from '@flycommerce/app-server';
import type { Reply } from './chat.js';

/** A product as the bubble shows it, with what it needs to add it to the cart and open its page. */
export interface ProductCard {
  id: string;
  title: string;
  slug: string;
  price: number;
}

interface StoreProduct {
  id: string;
  title: string;
  slug: string;
  price: number | string;
  salePrice?: number | string | null;
}

const PRICE =
  /\b(?:under|below|less than|cheaper than|max(?:imum)?|up to)\s*\$?(\d+(?:\.\d+)?)|<\s*\$?(\d+(?:\.\d+)?)/i;
const FILLER = new Set([
  'a',
  'an',
  'any',
  'some',
  'the',
  'i',
  'im',
  "i'm",
  'want',
  'need',
  'looking',
  'for',
  'find',
  'me',
  'show',
  'please',
  'do',
  'you',
  'have',
  'got',
  'is',
  'there',
]);
const SHOWN = 5;

// "green tea under 20" becomes the words "green tea" and a top price of 20.
export function understand(message: string): { words: string; maxPrice: number | null } {
  const price = PRICE.exec(message);
  const words = message
    .replace(PRICE, ' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter((word) => word && !FILLER.has(word));

  return { words: words.join(' '), maxPrice: price ? Number(price[1] ?? price[2]) : null };
}

export async function findProducts(store: StoreClient, message: string): Promise<Reply> {
  const { words, maxPrice } = understand(message);

  if (!words) {
    return { text: 'What are you looking for?', suggestions: ['green tea', 'mugs under 15'] };
  }

  // The store's ranked search: typo-tolerant on a real store, by matching words on the emulator.
  const { data } = await store.get<{ data: StoreProduct[] }>('/api/v1/search/products', { search: words, limit: 20 });
  const products = data
    .map((product) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      price: Number(product.salePrice ?? product.price),
    }))
    .filter((product) => maxPrice === null || product.price <= maxPrice)
    .slice(0, SHOWN);

  if (products.length === 0) {
    return {
      text: maxPrice === null ? `I couldn't find "${words}".` : `I couldn't find "${words}" for ${maxPrice} or less.`,
      suggestions: ['green tea', 'mugs'],
    };
  }

  return { text: products.length === 1 ? 'I found this:' : 'Here is what I found:', products };
}
