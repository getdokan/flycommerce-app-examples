import { useCallback } from 'react';
import { useAppBridge } from '@flycommerce/app-bridge/react';

/** Calls this app's own server with a fresh session token, and throws the server's message when it refuses. */
export function useApi() {
  const bridge = useAppBridge();

  return useCallback(
    async <T>(path: string, send?: { method: 'POST' | 'PUT'; body: unknown }): Promise<T> => {
      const init = send && {
        method: send.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(send.body),
      };
      const response = await bridge.fetch(path, init);
      const body = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(body.message ?? 'Something went wrong. Try again.');
      return body as T;
    },
    [bridge]
  );
}
