import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LIMIT = 500;

interface StoreData {
  limit: number;
}

/** Everything the app keeps, per store, in one JSON file. */
export class Data {
  constructor(private readonly file: string) {}

  limit(store: string): number {
    return this.read()[store]?.limit ?? DEFAULT_LIMIT;
  }

  setLimit(store: string, limit: number): void {
    this.update(store, (data) => (data.limit = limit));
  }

  private update(store: string, change: (data: StoreData) => unknown): void {
    const all = this.read();
    const data = all[store] ?? { limit: DEFAULT_LIMIT };
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
