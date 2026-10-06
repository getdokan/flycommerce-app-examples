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
import { type StoreSettings, useApi } from './api';
import { ColumnChoice } from './ColumnChoice';
import { lastDays } from './dates';
import { fileName } from './fileName';

const TITLE = 'Settings';
const DESCRIPTION = 'How exported files are named, and the columns they have unless you choose others.';

export function Settings() {
  const api = useApi();
  const bridge = useAppBridge();
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<StoreSettings>('/api/settings')
      .then(setSettings)
      .catch((failure: Error) => setError(failure.message));
  }, [api]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);

    try {
      const body = { fileName: settings.fileName, columns: settings.columns };
      setSettings(await api<StoreSettings>('/api/settings', { method: 'PUT', body }));
      setError(null);
      bridge.toast('Settings saved', { type: 'success' }).catch(() => {});
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const example = lastDays(30);

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
                <Field>
                  <FieldLabel htmlFor="file-name">File name</FieldLabel>
                  <Input
                    id="file-name"
                    value={settings.fileName}
                    onChange={(e) => setSettings({ ...settings, fileName: e.target.value })}
                  />
                  <FieldDescription>
                    Use {'{store}'}, {'{from}'} and {'{to}'} for the store and the first and last day. “.csv” is added
                    for you.
                  </FieldDescription>
                  <FieldDescription className="break-all">
                    The last 30 days: {fileName(settings.fileName, settings.store, example.from, example.to)}
                  </FieldDescription>
                </Field>
                <ColumnChoice
                  value={settings.columns}
                  onValueChange={(columns) => setSettings({ ...settings, columns })}
                  description="Checked on the Export orders page to start with."
                />
              </>
            )}
            {error && <FieldError>{error}</FieldError>}
            <Button
              type="submit"
              disabled={!settings || !settings.fileName.trim() || settings.columns.length === 0 || busy}
              className="justify-self-start"
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
