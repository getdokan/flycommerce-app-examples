import fs from 'node:fs';
import path from 'node:path';
import type { Sealer } from '@flycommerce/app-server';

export interface Settings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  minOrderValue: number;
  includeCustomerInfo: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  botToken: '',
  chatId: '',
  minOrderValue: 0,
  includeCustomerInfo: true,
};

// On disk the bot token and the webhook secret are sealed; everything else is plain.
interface StoreRecord {
  settings?: Omit<Settings, 'botToken'> & { sealedBotToken: string };
  sealedWebhookSecret?: string;
}

/** What the app keeps per store, in one JSON file. */
export class Data {
  constructor(
    private readonly file: string,
    private readonly sealer: Sealer
  ) {}

  settings(store: string): Settings {
    const saved = this.read()[store]?.settings;
    if (!saved) return { ...DEFAULT_SETTINGS };

    const { sealedBotToken, ...rest } = saved;
    return { ...DEFAULT_SETTINGS, ...rest, botToken: sealedBotToken ? this.sealer.open(sealedBotToken) : '' };
  }

  setSettings(store: string, { botToken, ...rest }: Settings): void {
    this.update(store, (record) => {
      record.settings = { ...rest, sealedBotToken: botToken ? this.sealer.seal(botToken) : '' };
    });
  }

  webhookSecret(store: string): string | undefined {
    const sealed = this.read()[store]?.sealedWebhookSecret;
    return sealed ? this.sealer.open(sealed) : undefined;
  }

  setWebhookSecret(store: string, secret: string): void {
    this.update(store, (record) => {
      record.sealedWebhookSecret = this.sealer.seal(secret);
    });
  }

  private update(store: string, change: (record: StoreRecord) => void): void {
    const all = this.read();
    all[store] ??= {};
    change(all[store]);
    this.write(all);
  }

  private read(): Record<string, StoreRecord> {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  // Written beside the file and renamed over it, so a crash mid-write never leaves half a file.
  private write(all: Record<string, StoreRecord>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(all, null, 2));
    fs.renameSync(temporary, this.file);
  }
}
