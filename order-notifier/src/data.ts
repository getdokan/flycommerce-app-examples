import fs from 'node:fs';
import path from 'node:path';
import type { Sealer } from '@flycommerce/app-server';

export interface Settings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  minOrderValue: number;
  includeCustomerInfo: boolean;
  webhookSecret?: string;
}

interface DiskSettings {
  enabled: boolean;
  sealedBotToken: string;
  chatId: string;
  minOrderValue: number;
  includeCustomerInfo: boolean;
  webhookSecret?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  botToken: '',
  chatId: '',
  minOrderValue: 0,
  includeCustomerInfo: true,
};

/** What the app keeps per store, in one JSON file with bot tokens sealed at rest. */
export class Data {
  constructor(private readonly file: string, private readonly sealer: Sealer) {}

  settings(store: string): Settings {
    const raw = this.read()[store];
    if (!raw) return { ...DEFAULT_SETTINGS };

    let botToken = '';
    if (raw.sealedBotToken) {
      try {
        botToken = this.sealer.open(raw.sealedBotToken) ?? '';
      } catch {
        botToken = '';
      }
    }

    return {
      enabled: raw.enabled ?? false,
      botToken,
      chatId: raw.chatId ?? '',
      minOrderValue: raw.minOrderValue ?? 0,
      includeCustomerInfo: raw.includeCustomerInfo ?? true,
      webhookSecret: raw.webhookSecret,
    };
  }

  setSettings(store: string, settings: Settings): void {
    const all = this.read();
    const sealedBotToken = settings.botToken ? this.sealer.seal(settings.botToken) : '';

    all[store] = {
      enabled: settings.enabled,
      sealedBotToken,
      chatId: settings.chatId,
      minOrderValue: settings.minOrderValue,
      includeCustomerInfo: settings.includeCustomerInfo,
      webhookSecret: settings.webhookSecret ?? all[store]?.webhookSecret,
    };

    this.write(all);
  }

  setWebhookSecret(store: string, secret: string): void {
    const all = this.read();
    if (!all[store]) {
      all[store] = {
        enabled: false,
        sealedBotToken: '',
        chatId: '',
        minOrderValue: 0,
        includeCustomerInfo: true,
        webhookSecret: secret,
      };
    } else {
      all[store].webhookSecret = secret;
    }
    this.write(all);
  }

  webhookSecret(store: string): string | undefined {
    return this.read()[store]?.webhookSecret;
  }

  private read(): Record<string, DiskSettings> {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  // Written beside the file and renamed over it, so a crash mid-write never leaves half a file.
  private write(all: Record<string, DiskSettings>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(all, null, 2));
    fs.renameSync(temporary, this.file);
  }
}
