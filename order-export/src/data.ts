import fs from 'node:fs';
import path from 'node:path';
import { COLUMNS } from './columns.js';

export interface Settings {
  fileName: string;
  columns: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  fileName: 'orders-{from}-to-{to}',
  columns: COLUMNS.map((column) => column.key),
};

/** What the app keeps per store, in one JSON file. */
export class Data {
  constructor(private readonly file: string) {}

  settings(store: string): Settings {
    return { ...DEFAULT_SETTINGS, ...this.read()[store] };
  }

  setSettings(store: string, settings: Settings): void {
    const all = this.read();
    all[store] = settings;
    this.write(all);
  }

  private read(): Record<string, Settings> {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  // Written beside the file and renamed over it, so a crash mid-write never leaves half a file.
  private write(all: Record<string, Settings>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(all, null, 2));
    fs.renameSync(temporary, this.file);
  }
}
