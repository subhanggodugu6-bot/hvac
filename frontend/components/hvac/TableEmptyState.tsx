'use client';

import React from 'react';
import { EmptyState } from '@/components/hvac/EmptyState';

export function TableEmptyState({
  colSpan,
  title = 'NO DATA',
  detail,
  onRetry,
}: {
  colSpan: number;
  title?: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0 border-0">
        <EmptyState title={title} detail={detail} onRetry={onRetry} />
      </td>
    </tr>
  );
}
