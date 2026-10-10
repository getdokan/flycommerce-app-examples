import type { StoreClient } from '@flycommerce/app-server';

const SHOWN = 2;

// Suggestions are products this store sells; a store with none, or a failed read, gets no product chips.
export async function productSuggestions(store: StoreClient): Promise<string[]> {
  try {
    const { data } = await store.get<{ data: { title: string }[] }>('/api/v1/products', { limit: 10 });
    const titles = new Set(data.map((product) => product.title.trim().toLowerCase()).filter(Boolean));

    return [...titles].slice(0, SHOWN);
  } catch {
    return [];
  }
}
