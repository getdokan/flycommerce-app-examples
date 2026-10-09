import { HttpError, json, readJson } from '@flycommerce/app-server';
import { testAlert as testAlertText } from './alert.js';
import type { Settings } from './data.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';
import { sendTelegramMessage } from './telegram.js';
import { subscribe } from './webhooks.js';

/** The settings as the page sees them: whether a bot token is saved, never the token itself. */
function visible(store: string, { botToken, ...rest }: Settings) {
  return { store, ...rest, botTokenSet: botToken !== '' };
}

export const showSettings: Route = async (app, req, res) => {
  const { store } = await whoIsAsking(app, req);

  json(res, 200, visible(store, app.data.settings(store)));
};

export const saveSettings: Route = async (app, req, res) => {
  const { store } = await whoIsAsking(app, req);
  const body = await readJson<Record<string, unknown>>(req);
  const current = app.data.settings(store);

  if (typeof body.botToken !== 'string' || typeof body.chatId !== 'string') {
    throw new HttpError(400, 'invalid_settings', 'Enter the bot token and the chat ID as text.');
  }

  const settings: Settings = {
    enabled: body.enabled === true,
    // The page never has the saved token, so a blank one means "keep it".
    botToken: body.botToken.trim() || current.botToken,
    chatId: body.chatId.trim(),
    minOrderValue: Math.max(0, Number(body.minOrderValue) || 0),
    includeCustomerInfo: body.includeCustomerInfo !== false,
  };

  // Install subscribes the store; this heals a store whose subscription failed then.
  if (settings.enabled && !app.data.webhookSecret(store)) await subscribe(app, store);

  app.data.setSettings(store, settings);
  json(res, 200, visible(store, settings));
};

export const testAlert: Route = async (app, req, res) => {
  const { store } = await whoIsAsking(app, req);
  const settings = app.data.settings(store);

  if (!settings.botToken || !settings.chatId) {
    throw new HttpError(400, 'not_configured', 'Save a bot token and a chat ID first.');
  }

  const result = await sendTelegramMessage(app.telegramApiUrl, settings, testAlertText(store));

  if (!result.ok) {
    throw new HttpError(400, 'telegram_error', `Telegram refused the message: ${result.description}`);
  }

  json(res, 200, { message: 'Test alert sent. Check your Telegram chat.' });
};
