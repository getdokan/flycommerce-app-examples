import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, json, readRawBody } from '@flycommerce/app-server';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';
import { sendTelegramMessage } from './telegram.js';

export const showSettings: Route = async (app, req, res) => {
  const session = await whoIsAsking(app, req);
  const current = app.data.settings(session.store);

  json(res, 200, {
    store: session.store,
    enabled: current.enabled,
    botToken: current.botToken,
    chatId: current.chatId,
    minOrderValue: current.minOrderValue,
    includeCustomerInfo: current.includeCustomerInfo,
  });
};

export const saveSettings: Route = async (app, req, res) => {
  const session = await whoIsAsking(app, req);
  const raw = await readRawBody(req);
  const payload = JSON.parse(raw || '{}');

  if (typeof payload.botToken !== 'string') {
    throw new HttpError(400, 'invalid_bot_token', 'Bot token must be a string.');
  }
  if (typeof payload.chatId !== 'string') {
    throw new HttpError(400, 'invalid_chat_id', 'Chat ID must be a string.');
  }

  const updated = {
    enabled: Boolean(payload.enabled),
    botToken: payload.botToken.trim(),
    chatId: payload.chatId.trim(),
    minOrderValue: Math.max(0, Number(payload.minOrderValue) || 0),
    includeCustomerInfo: payload.includeCustomerInfo !== false,
  };

  app.data.setSettings(session.store, updated);

  json(res, 200, {
    store: session.store,
    ...updated,
  });
};

export const testAlert: Route = async (app, req, res) => {
  const session = await whoIsAsking(app, req);
  const settings = app.data.settings(session.store);

  if (!settings.botToken || !settings.chatId) {
    throw new HttpError(400, 'not_configured', 'Please configure your Bot Token and Chat ID first.');
  }

  const result = await sendTelegramMessage({
    botToken: settings.botToken,
    chatId: settings.chatId,
    text: `🔔 <b>Test Notification from FlyCommerce!</b>\n\nYour <b>Order Notifier</b> app is successfully connected to <b>${session.store}</b>.`,
    apiBaseUrl: process.env.TELEGRAM_API_URL,
  });

  if (!result.ok) {
    throw new HttpError(400, 'telegram_error', result.description || 'Failed to send Telegram message.');
  }

  json(res, 200, {
    ok: true,
    message: 'Test notification sent successfully to Telegram!',
  });
};
