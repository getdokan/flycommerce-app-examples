import { useTitleBar } from '@flycommerce/app-bridge/react';
import {
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

const TITLE = 'Review queue';
const DESCRIPTION = 'Orders over your limit wait here until you have checked them.';

export function ReviewQueue() {
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });

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
