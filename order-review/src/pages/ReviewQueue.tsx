import { useEffect, useState } from 'react';
import { useAppBridge, useDashboardContext, useTitleBar } from '@flycommerce/app-bridge/react';
import {
  Alert,
  AlertDescription,
  Button,
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
  const bridge = useAppBridge();
  const locale = useDashboardContext()?.locale;
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { embedded } = useTitleBar({
    title: TITLE,
    subtitle: DESCRIPTION,
    actions: [{ id: 'settings', label: 'Settings', onAction: () => void bridge.openPage('settings') }],
  });

  useEffect(() => {
    const load = async () => {
      setMe(await api<Me>('/api/me'));
      setOrders((await api<{ orders: StoreOrder[] }>('/api/queue')).orders);
    };
    load().catch((failure: Error) => setLoadError(failure.message));
  }, [api]);

  const act = async (action: 'hold' | 'release', order: StoreOrder) => {
    setBusy(order.id);
    try {
      const body = await api<{ orders: StoreOrder[] }>(`/api/queue/${action}`, {
        method: 'POST',
        body: { orderId: order.id },
      });
      setOrders(body.orders);
      setActionError(null);
      bridge
        .toast(`Order #${order.orderNo} ${action === 'hold' ? 'is on hold' : 'released'}`, { type: 'success' })
        .catch(() => {});
    } catch (failure) {
      setActionError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  };

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
    {
      id: 'actions',
      header: 'Actions',
      meta: { align: 'end' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || row.original.status === 'on_hold'}
            onClick={() => act('hold', row.original)}
          >
            Hold
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => act('release', row.original)}>
            Release
          </Button>
        </div>
      ),
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
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
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
