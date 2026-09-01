'use client';

import React from 'react';
import { KPIGrid } from '@/components/hvac/KPIGrid';
import type { LucideIcon } from 'lucide-react';

export function KpiRow({
  items,
  loading,
}: {
  items: {
    label: string;
    value?: React.ReactNode | null;
    detail?: React.ReactNode | null;
    icon?: LucideIcon;
  }[];
  loading?: boolean;
}) {
  return (
    <KPIGrid
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      emptyText="AWAITING TELEMETRY"
      loading={loading}
      items={items}
    />
  );
}
