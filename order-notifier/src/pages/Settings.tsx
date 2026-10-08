import { type FormEvent, useEffect, useState } from 'react';
import { useAppBridge, useTitleBar } from '@flycommerce/app-bridge/react';
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@flycommerce/ui';
import { type NotifierSettings, useApi } from './api';

const TITLE = 'Telegram Order Alerts';
const DESCRIPTION =
  'Receive real-time notifications in your Telegram chat or team channel whenever an order is placed.';

export function Settings() {
  const api = useApi();
  const bridge = useAppBridge();
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });
  const [settings, setSettings] = useState<NotifierSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api<NotifierSettings>('/api/settings')
      .then(setSettings)
      .catch((failure: Error) => setError(failure.message));
  }, [api]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await api<NotifierSettings>('/api/settings', {
        method: 'PUT',
        body: {
          botToken: settings.botToken,
          chatId: settings.chatId,
          minOrderValue: Number(settings.minOrderValue) || 0,
          includeCustomerInfo: settings.includeCustomerInfo,
          enabled: settings.enabled,
        },
      });
      setSettings(updated);
      setSuccess('Settings saved successfully.');
      bridge.toast('Settings saved', { type: 'success' }).catch(() => {});
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendTestAlert = async () => {
    if (!settings) return;
    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api<{ ok: boolean; message: string }>('/api/test-alert', {
        method: 'POST',
      });
      setSuccess(result.message ?? 'Test alert sent! Check your Telegram chat.');
      bridge.toast('Test alert sent to Telegram!', { type: 'success' }).catch(() => {});
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="flex max-w-xl min-w-0 flex-col gap-4 p-1">
      {!embedded && (
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>{TITLE}</PageHeaderTitle>
            <PageHeaderDescription>{DESCRIPTION}</PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
      )}

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {success && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">How to connect Telegram in 60 seconds:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Search for <strong>@BotFather</strong> on Telegram and send <code>/newbot</code> to get your{' '}
              <strong>Bot Token</strong>.
            </li>
            <li>
              Send a message or <code>/start</code> to your newly created bot (or add it to your team group).
            </li>
            <li>
              Enter your <strong>Chat ID</strong> below (find it via <strong>@userinfobot</strong> or group ID).
            </li>
          </ol>
        </CardContent>
      </Card>

      <form onSubmit={save} className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-zinc-900">
              <input
                type="checkbox"
                checked={settings?.enabled ?? false}
                onChange={(e) => setSettings((s) => (s ? { ...s, enabled: e.target.checked } : null))}
                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              Enable Telegram alerts for new orders
            </label>

            <Field>
              <FieldLabel htmlFor="botToken">Telegram Bot Token</FieldLabel>
              <Input
                id="botToken"
                type="password"
                placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                value={settings?.botToken ?? ''}
                onChange={(e) => setSettings((s) => (s ? { ...s, botToken: e.target.value } : null))}
                required
              />
              <FieldDescription>Issued by @BotFather when you create your bot.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="chatId">Chat ID or Group ID</FieldLabel>
              <Input
                id="chatId"
                placeholder="e.g. 123456789 or -100123456789"
                value={settings?.chatId ?? ''}
                onChange={(e) => setSettings((s) => (s ? { ...s, chatId: e.target.value } : null))}
                required
              />
              <FieldDescription>
                Your personal Telegram user ID, or the group chat ID where alerts should be posted.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="minOrderValue">Minimum Order Value ($)</FieldLabel>
              <Input
                id="minOrderValue"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={settings?.minOrderValue ?? 0}
                onChange={(e) =>
                  setSettings((s) => (s ? { ...s, minOrderValue: parseFloat(e.target.value) || 0 } : null))
                }
              />
              <FieldDescription>
                Only send notifications for orders with total equal to or greater than this value (leave 0 for all
                orders).
              </FieldDescription>
            </Field>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={settings?.includeCustomerInfo ?? true}
                onChange={(e) => setSettings((s) => (s ? { ...s, includeCustomerInfo: e.target.checked } : null))}
                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              Include customer name and email address in the alert
            </label>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={sendTestAlert}
            disabled={testing || !settings?.botToken || !settings?.chatId}
          >
            {testing ? 'Sending Test...' : 'Send Test Alert'}
          </Button>

          <Button type="submit" disabled={busy || !settings}>
            {busy ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </main>
  );
}
