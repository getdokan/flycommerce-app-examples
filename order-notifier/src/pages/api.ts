import { useCallback } from 'react';
import { useAppBridge } from '@flycommerce/app-bridge/react';

export interface NotifierSettings {
  store: string;
  botToken: string;
  chatId: string;
  minOrderValue: number;
  includeCustomerInfo: boolean;
  enabled: boolean;
}

/** Calls this app's own server with a fresh session token, and throws the server's message when it refuses. */
export function useApi() {
  const bridge = useAppBridge();

  return useCallback(
    async <T>(path: string, send?: { method: 'PUT' | 'POST'; body?: unknown }): Promise<T> => {
      const init: RequestInit | undefined = send && {
        method: send.method,
        headers: { 'Content-Type': 'application/json' },
        body: send.body !== undefined ? JSON.stringify(send.body) : undefined,
      };
      const response = await bridge.fetch(path, init);
      const body = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(body.message ?? 'Something went wrong. Try again.');
      return body as T;
    },
    [bridge]
  );
}
