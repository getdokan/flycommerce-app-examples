import { useEffect, useState } from 'react';
import { useAppBridge, useTitleBar } from '@flycommerce/app-bridge/react';
import {
  Button,
  Card,
  CardContent,
  type DateRange,
  DateRangePicker,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@flycommerce/ui';
import { type StoreSettings, useApi } from './api';
import { ColumnChoice } from './ColumnChoice';
import { addDays, lastDays } from './dates';
import { fileName } from './fileName';

const TITLE = 'Export orders';
const DESCRIPTION = 'Download the orders placed in a period as a CSV file for Excel or Google Sheets.';

export function ExportOrders() {
  const api = useApi();
  const bridge = useAppBridge();
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });
  const [period, setPeriod] = useState<DateRange | undefined>(lastDays(30));
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<StoreSettings>('/api/settings')
      .then((saved) => {
        setSettings(saved);
        setColumns(saved.columns);
      })
      .catch((failure: Error) => setError(failure.message));
  }, [api]);

  const download = async () => {
    if (!period?.from || !settings) return;
    setBusy(true);

    try {
      // From the start of the first day to the start of the day after the last, in the merchant's time zone.
      const from = addDays(period.from, 0);
      const last = addDays(period.to ?? period.from, 0);
      const query = new URLSearchParams({
        from: from.toISOString(),
        to: addDays(last, 1).toISOString(),
        columns: columns.join(','),
      });

      const response = await bridge.fetch(`/api/export?${query}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? 'The export failed. Try again.');
      }

      save(await response.blob(), fileName(settings.fileName, settings.store, from, last));
      setError(null);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
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
      <Card>
        <CardContent className="grid gap-6">
          <Field>
            <FieldLabel htmlFor="period">Orders placed</FieldLabel>
            <DateRangePicker id="period" value={period} onValueChange={setPeriod} />
            <FieldDescription>Every order in these days, oldest first.</FieldDescription>
          </Field>
          {settings && (
            <ColumnChoice
              value={columns}
              onValueChange={setColumns}
              description="One row per order, with these columns. Change the defaults in Settings."
            />
          )}
          {error && <FieldError>{error}</FieldError>}
          <Button
            onClick={download}
            disabled={!period?.from || !settings || columns.length === 0 || busy}
            className="justify-self-start"
          >
            {busy ? 'Preparing…' : 'Download CSV'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function save(file: Blob, name: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href));
}
