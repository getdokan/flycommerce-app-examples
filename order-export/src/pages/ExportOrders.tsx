import { useState } from 'react';
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

const TITLE = 'Export orders';
const DESCRIPTION = 'Download the orders placed in a period as a CSV file for Excel or Google Sheets.';

export function ExportOrders() {
  const bridge = useAppBridge();
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });
  const [period, setPeriod] = useState<DateRange | undefined>(lastDays(30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!period?.from) return;
    setBusy(true);

    try {
      // From the start of the first day to the start of the day after the last, in the merchant's time zone.
      const from = addDays(period.from, 0);
      const last = addDays(period.to ?? period.from, 0);
      const query = new URLSearchParams({ from: from.toISOString(), to: addDays(last, 1).toISOString() });

      const response = await bridge.fetch(`/api/export?${query}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? 'The export failed. Try again.');
      }

      save(await response.blob(), `orders-${day(from)}-to-${day(last)}.csv`);
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
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="period">Orders placed</FieldLabel>
            <DateRangePicker id="period" value={period} onValueChange={setPeriod} />
            <FieldDescription>Every order in these days, oldest first.</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Button onClick={download} disabled={!period?.from || busy} className="justify-self-start">
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

function lastDays(count: number): DateRange {
  const today = addDays(new Date(), 0);
  return { from: addDays(today, 1 - count), to: today };
}

// Midnight, `count` calendar days later; plain milliseconds would drift an hour across a daylight-saving change.
function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

function day(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
