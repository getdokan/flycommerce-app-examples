import { useEffect, useState } from 'react';
import { useTitleBar } from '@flycommerce/app-bridge/react';
import {
  Alert,
  AlertDescription,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Icon,
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@flycommerce/ui';
import { useApi } from './api';

interface Me {
  store: string;
  userId: string;
  role: string;
}

const TITLE = 'Review queue';
const DESCRIPTION = 'Orders over your limit wait here until you have checked them.';

export function ReviewQueue() {
  const api = useApi();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });

  useEffect(() => {
    api<Me>('/api/me')
      .then(setMe)
      .catch((failure: Error) => setError(failure.message));
  }, [api]);

  return (
    <main className="flex min-w-0 flex-col gap-4 p-1">
      {!embedded && (
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>{TITLE}</PageHeaderTitle>
            <PageHeaderDescription>{DESCRIPTION}</PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
      )}
      {me && (
        <p className="text-muted-foreground">
          Signed in as user {me.userId} ({me.role}) on {me.store}.
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon name="orders" />
            </EmptyMedia>
            <EmptyTitle>Nothing to check</EmptyTitle>
            <EmptyDescription>New orders over your limit will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    </main>
  );
}
