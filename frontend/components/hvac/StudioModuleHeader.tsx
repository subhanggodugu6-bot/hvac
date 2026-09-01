'use client';

import React from 'react';
import type { OpportunityDef } from '@/lib/hvac/opportunityConfig';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';

export function StudioModuleHeader({
  def,
  code,
  eyebrow,
  title,
  description,
  badges,
  actions,
  banner,
  metrics,
}: {
  def: OpportunityDef;
  code: string;
  eyebrow?: string;
  title: string;
  description: string;
  badges: React.ReactNode;
  actions?: React.ReactNode;
  banner?: React.ReactNode;
  metrics?: React.ReactNode;
}) {
  const label = code.replace(/[^A-Z0-9]/gi, '') || code;
  return (
    <header className="px-5 pt-5 pb-4 space-y-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-violet-700 mb-1.5">
            {eyebrow || code}
          </div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{title}</h1>
          <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label={`${label} system status`}>
            {badges}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
      {banner}
      {metrics}
    </header>
  );
}

export function StudioSimulatedBanner({ detail }: { detail?: string }) {
  return (
    <div className="glass-card p-4" role="status">
      <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-800">SIMULATED DATA</div>
      <p className="text-[13px] text-slate-600 mt-1">
        {detail || 'Demo / simulation telemetry is never labeled LIVE. BMS writes are not implied.'}
      </p>
    </div>
  );
}
