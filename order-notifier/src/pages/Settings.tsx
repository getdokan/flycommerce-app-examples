import { type FormEvent, useEffect, useState } from 'react';
import { useAppBridge, useTitleBar } from '@flycommerce/app-bridge/react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
  Switch,
} from '@flycommerce/ui';
import { type NotifierSettings, useApi } from './api';

const TITLE = 'Telegram alerts';
const DESCRIPTION = 'A message in your Telegram chat or group whenever an order is placed.';

export function Settings() {
  const api = useApi();
  const bridge = useAppBridge();
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });
  const [settings, setSettings] = useState<NotifierSettings | null>(null);
  // The saved token never comes back from the server; this holds only a new one being typed.
  const [botToken, setBotToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<NotifierSettings>('/api/settings')
      .then(setSettings)
      .catch((failure: Error) => setError(failure.message));
  }, [api]);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      const done = await work();
      setError(null);
      bridge.toast(done, { type: 'success' }).catch(() => {});
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;

    run(async () => {
      const { store: _store, botTokenSet: _set, ...rest } = settings;
      setSettings(await api<NotifierSettings>('/api/settings', { method: 'PUT', body: { ...rest, botToken } }));
      setBotToken('');
      return 'Settings saved';
    });
  };

  const sendTest = () =>
    run(async () => (await api<{ message: string }>('/api/test-alert', { method: 'POST' })).message);

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
      <Card>
        <CardContent>
          <form onSubmit={save} className="grid gap-6">
            {settings && (
              <>
                <Field orientation="horizontal">
                  <Switch
                    id="enabled"
                    checked={settings.enabled}
                    onCheckedChange={(enabled) => setSettings({ ...settings, enabled })}
                  />
                  <FieldLabel htmlFor="enabled">Send an alert for every new order</FieldLabel>
                </Field>
                <Field>
                  <FieldLabel htmlFor="bot-token">Bot token</FieldLabel>
                  <Input
                    id="bot-token"
                    type="password"
                    autoComplete="off"
                    placeholder={settings.botTokenSet ? 'Saved. Enter a new one to replace it.' : '123456789:ABC…'}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                  />
                  <FieldDescription>
                    In Telegram, send <code>/newbot</code> to @BotFather. It answers with the token.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="chat-id">Chat ID</FieldLabel>
                  <Input
                    id="chat-id"
                    placeholder="123456789 or -100123456789"
                    value={settings.chatId}
                    onChange={(e) => setSettings({ ...settings, chatId: e.target.value })}
                  />
                  <FieldDescription>
                    Send your bot a message (or add it to a group), then ask @userinfobot for the chat's ID.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="minimum">Minimum order total</FieldLabel>
                  <Input
                    id="minimum"
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.minOrderValue}
                    onChange={(e) => setSettings({ ...settings, minOrderValue: Number(e.target.value) || 0 })}
                  />
                  <FieldDescription>Smaller orders don't send an alert. 0 sends one for every order.</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="customer"
                    checked={settings.includeCustomerInfo}
                    onCheckedChange={(checked) => setSettings({ ...settings, includeCustomerInfo: checked === true })}
                  />
                  <FieldLabel htmlFor="customer">Include the customer's name and email</FieldLabel>
                </Field>
              </>
            )}
            {error && <FieldError>{error}</FieldError>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!settings || busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={sendTest} disabled={!settings?.botTokenSet || busy}>
                Send test alert
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
