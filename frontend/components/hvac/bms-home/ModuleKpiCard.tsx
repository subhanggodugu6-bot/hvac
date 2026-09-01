'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';

export type AgentModuleCardData = {
  id: string;
  status: string;
  telemetry: string;
  recommendation: string;
  control: string;
  kind?: string;
  model?: string;
  engine?: string;
};

function telDot(label?: string) {
  const v = String(label || '').toUpperCase();
  if (v === 'LIVE') return 'bg-emerald-500';
  if (v === 'SIMULATED' || v === 'STALE') return 'bg-amber-500';
  if (v.includes('BAD') || v.includes('OFF') || v.includes('NO DATA')) return 'bg-pink-500';
  return 'bg-slate-400';
}

function controlLabel(raw?: string | null) {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'SIM WRITE ENABLED' || v === 'SIM_WRITE_ENABLED') return 'SIM WRITE ENABLED';
  if (v === 'LIVE WRITE ENABLED' || v === 'LIVE_WRITE_ENABLED') return 'LIVE WRITE ENABLED';
  if (v.includes('ENABLED') && !v.includes('DISABLED')) return 'WRITE ENABLED';
  if (v === 'ADVISORY' || v === 'MAINTENANCE' || v === 'REVIEW') return v;
  return 'WRITE DISABLED';
}

function agentTone(label: string) {
  const v = label.toUpperCase();
  if (v === 'READY') return 'text-emerald-700';
  if (v.includes('WAIT') || v.includes('HOLD') || v.includes('OFFLINE')) return 'text-amber-700';
  if (v.includes('SAFE')) return 'text-pink-700';
  return 'text-slate-700';
}

function MetricRow({ label, value, dot }: { label: string; value: React.ReactNode; dot?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 items-start py-1 border-b border-slate-100 last:border-b-0">
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500 pt-0.5">{label}</span>
      <span className="text-[10px] font-mono font-semibold text-slate-800 text-right leading-snug inline-flex items-start justify-end gap-1.5">
        {dot ? <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${telDot(String(value))}`} /> : null}
        <span className="break-words">{value}</span>
      </span>
    </div>
  );
}

export function ModuleKpiCard({
  card,
  href,
  railColor,
}: {
  card: AgentModuleCardData;
  href: string;
  railColor: string;
}) {
  const def = getOpportunity(card.id);
  const ctrl = controlLabel(card.control);
  const waiting = String(card.status || '').includes('WAITING');
  const model = card.model && card.model !== '—' ? card.model : card.engine && card.engine !== '—' ? card.engine : 'NO DATA';

  return (
    <Link
      href={href}
      className="card-interactive glass-card flex flex-col p-0 overflow-hidden group min-h-[220px]"
      style={{ borderLeft: `3px solid ${railColor}` }}
    >
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-800">
            {card.id}
          </span>
          <h3 className="text-[13px] font-bold text-slate-900 mt-2 tracking-tight leading-snug group-hover:text-violet-800">
            {def?.shortLabel || def?.title || card.id}
          </h3>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-700 shrink-0 mt-1" />
      </div>

      <div className="px-4 pb-4 flex-1">
        <MetricRow label="Telemetry" value={card.telemetry || 'NO DATA'} dot />
        <MetricRow label="Agent" value={card.status || 'NO DATA'} />
        <MetricRow label="Kind" value={card.kind || 'CONTROL'} />
        <MetricRow label="Recommendation" value={card.recommendation || 'UNAVAILABLE'} />
        <MetricRow label="Model" value={model} />
        <MetricRow
          label="Control"
          value={<span className={ctrl.includes('DISABLED') ? 'text-pink-700' : 'text-emerald-700'}>{ctrl}</span>}
        />
      </div>

      {waiting ? (
        <div className="px-4 py-2 text-[10px] text-amber-800 font-medium bg-amber-50/80 border-t border-amber-100">
          Waiting for mapped telemetry
        </div>
      ) : null}
    </Link>
  );
}

export { controlLabel, telDot, agentTone };
