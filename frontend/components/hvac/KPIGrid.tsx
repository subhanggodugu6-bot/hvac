'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiItem {
  label: string;
  value?: React.ReactNode | null;
  detail?: React.ReactNode | null;
  unit?: string | null;
  status?: string | null;
  source?: string | null;
  quality?: string | null;
  icon?: LucideIcon;
}

export const KPIGrid: React.FC<{ items: KpiItem[]; emptyText?: string; className?: string }> = ({
  items,
  emptyText = 'AWAITING TELEMETRY',
  className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4',
}) => (
  <div className={className}>
    {items.map((kpi) => {
      const missing = kpi.value === null || kpi.value === undefined || kpi.value === '';
      return (
        <div key={kpi.label} className="kpi-tile">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-600 tracking-wide">{kpi.label}</span>
          </div>
          <div
            className={`mt-3 min-h-[1.7rem] text-[1.65rem] font-bold tracking-tight leading-none ${
              missing ? 'text-amber-600 text-sm font-semibold' : 'text-slate-900'
            }`}
          >
            {missing ? emptyText : kpi.value}
          </div>
          <div className="text-[11px] text-slate-600 mt-2 truncate">{missing ? '' : kpi.detail || kpi.unit || ''}</div>
          {!missing && (kpi.status || kpi.source || kpi.quality) ? (
            <div className="text-[10px] font-mono text-slate-600 mt-1 truncate">
              {[kpi.status, kpi.quality, kpi.source].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>
      );
    })}
  </div>
);
