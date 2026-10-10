import { type StoreClient, StoreApiError } from '@flycommerce/app-server';
import type { Reply } from './chat.js';
import { productSuggestions } from './suggest.js';

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
    .filter((word) => word && !FILLER.has(word))
    .map(singular);

  return { words: words.join(' '), maxPrice: price ? Number(price[1] ?? price[2]) : null };
}

// "mugs" finds "Stoneware mug": a store's search matches the words, and products are named in the singular.
function singular(word: string): string {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x|z|ss)es$/.test(word)) return word.slice(0, -2);
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

// A store without its search service answers 5xx on the ranked search; its product list still matches names.
async function search(store: StoreClient, words: string): Promise<StoreProduct[]> {
  try {
    return (await store.get<{ data: StoreProduct[] }>('/api/v1/search/products', { search: words, limit: 20 })).data;
  } catch (error) {
    if (!(error instanceof StoreApiError) || error.upstreamStatus < 500) throw error;
    return (await store.get<{ data: StoreProduct[] }>('/api/v1/products', { search: words, limit: 20 })).data;
  }
}

export async function findProducts(store: StoreClient, message: string): Promise<Reply> {
  const { words, maxPrice } = understand(message);

  if (!words) {
    return { text: 'What are you looking for?', suggestions: await productSuggestions(store) };
  }

  // The store's ranked search: typo-tolerant on a real store, by matching words on the emulator.
  const products = (await search(store, words))
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
      suggestions: await productSuggestions(store),
    };
  }

  return { text: products.length === 1 ? 'I found this:' : 'Here is what I found:', products };
}
