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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from '@flycommerce/ui';
import { useApi } from './api';

export function Settings() {
  const api = useApi();
  const bridge = useAppBridge();
  const [limit, setLimit] = useState('');
  const [currency, setCurrency] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { embedded } = useTitleBar({ title: 'Settings' });

  useEffect(() => {
    api<{ limit: number; currency: string | null }>('/api/settings')
      .then((body) => {
        setLimit(String(body.limit));
        setCurrency(body.currency);
      })
      .catch((failure: Error) => setError(failure.message));
  }, [api]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('/api/settings', { method: 'PUT', body: { limit: Number(limit) } });
      setError(null);
      bridge.toast('Limit saved', { type: 'success' }).catch(() => {});
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <main className="flex max-w-xl min-w-0 flex-col gap-4 p-1">
      {!embedded && (
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>Settings</PageHeaderTitle>
          </PageHeaderContent>
        </PageHeader>
      )}
      <Card>
        <CardContent>
          <form onSubmit={save} className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="limit">Review limit</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="limit"
                  type="number"
                  min={0}
                  step="0.01"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
                {currency && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>{currency}</InputGroupText>
                  </InputGroupAddon>
                )}
              </InputGroup>
              <FieldDescription>New orders with a total above this amount wait in the Review queue.</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Button type="submit" disabled={limit === ''} className="justify-self-start">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
