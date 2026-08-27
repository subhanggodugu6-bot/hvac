'use client';

import React from 'react';
import Link from 'next/link';
import { StatusBadge, toneForStatus } from './StatusBadge';
import { emptyLabel } from './EmptyState';

export interface OpportunityCardField {
  label: string;
  value?: React.ReactNode | null;
}

export interface OpportunityCardProps {
  code: string;
  title: string;
  href: string;
  status?: string | null;
  fields?: OpportunityCardField[];
  impactLabel?: string;
  impactValue?: React.ReactNode | null;
  emptyTitle?: string;
  emptyDetail?: string;
  telemetryLabel?: string | null;
  maxFields?: number;
}

export const OpportunityCard: React.FC<OpportunityCardProps> = ({
  code,
  title,
  href,
  status,
  fields = [],
  impactLabel,
  impactValue,
  emptyTitle,
  emptyDetail,
  telemetryLabel,
  maxFields,
}) => {
  const visible = fields
    .filter((f) => f.value !== null && f.value !== undefined && f.value !== '')
    .slice(0, maxFields ?? 6);
  const statusText = status || emptyTitle || 'AWAITING TELEMETRY';

  return (
    <Link
      href={href}
      className="card-interactive glass-card flex flex-col justify-between p-4 group border-l-[3px] border-l-violet-400"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 tracking-wide">
            {code}
          </span>
          <StatusBadge tone={toneForStatus(statusText)} pulse={false}>
            {statusText}
          </StatusBadge>
        </div>
        <h3 className="text-[15px] font-semibold text-slate-900 mt-3 tracking-tight leading-snug group-hover:text-violet-700 transition-colors">
          {title}
        </h3>
        {telemetryLabel ? <p className="text-[10px] font-mono text-slate-400 mt-1">{telemetryLabel}</p> : null}
      </div>

      <div className="my-3 space-y-1.5 py-3 border-y border-slate-100 text-xs">
        {visible.length === 0 ? (
          <div className="text-amber-700 text-[11px]">
            {emptyTitle || 'AWAITING TELEMETRY'}
            <div className="text-slate-500 mt-1 leading-relaxed">
              {emptyDetail || 'No usable telemetry or evaluation is available for this opportunity.'}
            </div>
          </div>
        ) : (
          visible.map((m) => (
            <div key={m.label} className="flex items-center justify-between gap-3 text-slate-500">
              <span>{m.label}</span>
              <span className="text-slate-800 font-semibold text-right font-mono text-[11px]">{m.value}</span>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        {impactLabel && (
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{impactLabel}</span>
            <span className="text-violet-700 font-mono font-semibold">
              {emptyLabel(impactValue, emptyTitle || 'AWAITING TELEMETRY')}
            </span>
          </div>
        )}
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-violet-600 group-hover:text-violet-800">
          Open studio
        </span>
      </div>
    </Link>
  );
};
