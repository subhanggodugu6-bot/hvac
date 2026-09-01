'use client';

import React from 'react';
import Link from 'next/link';

export const EmptyState: React.FC<{
  title?: string;
  detail?: string;
  href?: string;
  actionLabel?: string;
  onRetry?: () => void;
}> = ({
  title = 'NO DATA',
  detail = 'Telemetry is not currently available for this opportunity.',
  href,
  actionLabel,
  onRetry,
}) => (
  <div className="card-static p-8 space-y-4 text-center sm:text-left">
    <div className="mx-auto sm:mx-0 w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
      <span className="text-[10px] font-bold text-amber-700 tracking-wider">—</span>
    </div>
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] font-bold text-amber-800">{title}</div>
      <p className="text-[13px] text-slate-600 leading-relaxed max-w-xl mt-2">{detail}</p>
    </div>
    <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
      {href && actionLabel ? (
        <Link href={href} className="btn-primary">
          {actionLabel}
        </Link>
      ) : null}
      {onRetry ? (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  </div>
);

export const emptyLabel = (value: unknown, fallback = 'NO DATA'): React.ReactNode =>
  value === null || value === undefined || value === '' ? fallback : (value as React.ReactNode);
