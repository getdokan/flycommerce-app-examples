export interface TelegramResult {
  ok: boolean;
  description?: string;
}

/** Sends `text` (Telegram HTML) to a chat through the merchant's own bot. */
export async function sendTelegramMessage(
  apiUrl: string,
  to: { botToken: string; chatId: string },
  text: string
): Promise<TelegramResult> {
  const response = await fetch(`${apiUrl}/bot${to.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: to.chatId, text, parse_mode: 'HTML' }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as TelegramResult;

  if (response.ok && body.ok) return { ok: true };

  return { ok: false, description: body.description ?? `Telegram answered ${response.status}.` };
}
