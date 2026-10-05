import fs from 'node:fs';
import path from 'node:path';
import type { Sealer } from '@flycommerce/app-server';

export const DEFAULT_LIMIT = 500;
const REMEMBERED_ORDERS = 1000;

export interface QueuedOrder {
  id: string;
  queuedAt: string;
}

interface StoreData {
  limit: number;
  queue: QueuedOrder[];
  /** Every order ever queued, so a repeated delivery or a catch-up never queues it twice. */
  seen: string[];
  webhookSecret?: string;
  caughtUpTo?: string;
}

/** What the app keeps per store, in one JSON file. The webhook secret is sealed with ENCRYPTION_KEY. */
export class Data {
  constructor(private readonly file: string, private readonly sealer: Sealer) {}

  stores(): string[] {
    return Object.keys(this.read());
  }

  add(store: string): void {
    this.update(store, () => {});
  }

  delete(store: string): void {
    const all = this.read();
    delete all[store];
    this.write(all);
  }

  webhookSecret(store: string): string | undefined {
    const sealed = this.read()[store]?.webhookSecret;
    return sealed && this.sealer.open(sealed);
  }

  setWebhookSecret(store: string, secret: string): void {
    this.update(store, (data) => (data.webhookSecret = this.sealer.seal(secret)));
  }

  limit(store: string): number {
    return this.read()[store]?.limit ?? DEFAULT_LIMIT;
  }

  setLimit(store: string, limit: number): void {
    this.update(store, (data) => (data.limit = limit));
  }

  queue(store: string): QueuedOrder[] {
    return this.read()[store]?.queue ?? [];
  }

  /** Queues the order unless it was queued before; says whether it did. */
  enqueue(store: string, id: string): boolean {
    let added = false;

    this.update(store, (data) => {
      if (data.seen.includes(id)) return;
      data.queue.push({ id, queuedAt: new Date().toISOString() });
      data.seen = [...data.seen, id].slice(-REMEMBERED_ORDERS);
      added = true;
    });

    return added;
  }

  dequeue(store: string, id: string): void {
    this.update(store, (data) => (data.queue = data.queue.filter((order) => order.id !== id)));
  }

  caughtUpTo(store: string): string | undefined {
    return this.read()[store]?.caughtUpTo;
  }

  setCaughtUpTo(store: string, time: string): void {
    this.update(store, (data) => (data.caughtUpTo = time));
  }

  private update(store: string, change: (data: StoreData) => unknown): void {
    const all = this.read();
    const data = all[store] ?? { limit: DEFAULT_LIMIT, queue: [], seen: [] };
    change(data);
    all[store] = data;
    this.write(all);
  }

  private read(): Record<string, StoreData> {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  // Written beside the file and renamed over it, so a crash mid-write never leaves half a file.
  private write(all: Record<string, StoreData>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(all, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
