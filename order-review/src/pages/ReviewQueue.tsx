import { useEffect, useState } from 'react';
import { useDashboardContext, useTitleBar } from '@flycommerce/app-bridge/react';
import {
  type ColumnDef,
  DataTable,
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
  StatusBadge,
} from '@flycommerce/ui';
import type { StoreOrder } from '../orders';
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
  const locale = useDashboardContext()?.locale;
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { embedded } = useTitleBar({ title: TITLE, subtitle: DESCRIPTION });

  useEffect(() => {
    const load = async () => {
      setMe(await api<Me>('/api/me'));
      setOrders((await api<{ orders: StoreOrder[] }>('/api/queue')).orders);
    };
    load().catch((failure: Error) => setLoadError(failure.message));
  }, [api]);

  const columns: ColumnDef<StoreOrder>[] = [
    { accessorKey: 'orderNo', header: 'Order', cell: ({ row }) => `#${row.original.orderNo}` },
    {
      accessorKey: 'createdAt',
      header: 'Placed',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(locale),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status.replace('_', ' ')} />,
    },
    {
      accessorKey: 'total',
      header: 'Total',
      meta: { align: 'end' },
      cell: ({ row }) => money(row.original, locale),
    },
  ];

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
      <DataTable
        columns={columns}
        data={orders ?? []}
        getRowId={(order) => order.id}
        loading={orders === null && !loadError}
        error={loadError ?? undefined}
        empty={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon name="orders" />
              </EmptyMedia>
              <EmptyTitle>Nothing to check</EmptyTitle>
              <EmptyDescription>New orders over your limit will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    </main>
  );
}

function money(order: StoreOrder, locale?: string): string {
  const currency = order.orderGroup?.currency ?? 'USD';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(order.total);
}
