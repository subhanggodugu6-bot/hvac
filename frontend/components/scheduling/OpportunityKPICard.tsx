'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';

export interface KpiMetric {
  label: string;
  value?: string | number | null;
  unit?: string | null;
  status?: string | null;
  unavailableReason?: string | null;
}

export interface OpportunityKpi {
  opportunityId?: string;
  name?: string;
  status?: string | null;
  displayState?: string | null;
  dataState?: string | null;
  primaryMetric?: KpiMetric | null;
  secondaryMetrics?: KpiMetric[] | null;
  impact?: { energy?: string | null; runtime?: string | null } | null;
  confidence?: string | null;
  safetyStatus?: string | null;
  comfortStatus?: string | null;
  telemetry?: {
    status?: string | null;
    ageSeconds?: number | null;
    lastUpdated?: string | null;
    label?: string | null;
    compact?: string | null;
  } | null;
  apiError?: string | null;
}

function fmt(m?: KpiMetric | null) {
  if (!m) return { text: 'MODEL NOT READY', missing: true, reason: undefined as string | undefined };
  if (m.value === null || m.value === undefined || m.value === '') {
    const reason = String(m.unavailableReason || '');
    if (/model not ready|confidence not set|no decision confidence/i.test(reason)) {
      return { text: 'MODEL NOT READY', missing: true, reason: reason || undefined };
    }
    return { text: 'DATA NOT AVAILABLE', missing: true, reason: reason || undefined };
  }
  const unit = m.unit ? ` ${m.unit}` : '';
  return { text: `${m.value}${unit}`, missing: false, reason: undefined as string | undefined };
}

function stateExplain(opp: OpportunityKpi, backendOffline?: boolean) {
  if (backendOffline) return 'Scheduling dashboard API did not respond.';
  if (opp.apiError) return opp.apiError;
  switch (opp.dataState) {
    case 'LIVE':
      return 'Live evaluation from backend telemetry.';
    case 'STALE':
      return 'Latest evaluation exists but telemetry exceeds the freshness threshold.';
    case 'LAST_KNOWN':
      return 'Showing last valid stored evaluation; live telemetry is unavailable.';
    case 'AWAITING_TELEMETRY':
      return 'No usable telemetry or evaluation has been received.';
    case 'ENGINE_OFFLINE':
      return 'Opportunity engine is unavailable.';
    case 'ERROR':
      return opp.apiError || 'Backend calculation failed.';
    default:
      return opp.displayState || '';
  }
}

interface OpportunityKPICardProps {
  opportunity: OpportunityKpi;
  href: string;
  backendOffline?: boolean;
}

export const OpportunityKPICard: React.FC<OpportunityKPICardProps> = ({
  opportunity,
  href,
  backendOffline,
}) => {
  const code = String(opportunity.opportunityId || '').padStart(2, '0').replace(/^0+(O)/, '$1');
  const id = opportunity.opportunityId || '';
  const primary = fmt(opportunity.primaryMetric);
  const secondaries = (opportunity.secondaryMetrics || []).filter(
    (m) => !(m.value == null && /does not publish|not set on this engine/i.test(String(m.unavailableReason || '')))
  );
  const tel = opportunity.telemetry?.compact || opportunity.telemetry?.label;
  const statusText = backendOffline
    ? 'ERROR'
    : opportunity.status || opportunity.dataState || 'AWAITING TELEMETRY';
  const hasAny =
    !primary.missing ||
    secondaries.some((m) => m.value !== null && m.value !== undefined && m.value !== '');

  return (
    <Link href={href} className="card-interactive glass-card relative flex h-full min-h-[280px] flex-col p-5 group overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-violet-400/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border border-violet-200 bg-violet-50 text-violet-800 tracking-wide">
          {id || code}
        </span>
        <StatusBadge tone={toneForStatus(statusText)} pulse={false}>
          {statusText}
        </StatusBadge>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-slate-900 line-clamp-2 group-hover:text-violet-800 transition-colors">
        {opportunity.name}
      </h3>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {opportunity.primaryMetric?.label || 'Primary'}
        </div>
        <div
          className={`mt-1 font-mono text-2xl font-semibold leading-none ${
            primary.missing ? 'text-slate-500' : 'text-slate-900'
          }`}
        >
          {primary.text}
        </div>
        {primary.missing && primary.reason ? (
          <p className="mt-1 text-[10px] text-slate-500">{primary.reason}</p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-x-2 gap-y-3 border-t border-slate-200 pt-3">
        {secondaries.map((m) => {
          const v = fmt(m);
          const energy = /energy/i.test(m.label);
          return (
            <div key={m.label} className="min-w-0">
              <div className="truncate text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                {m.label}
              </div>
              <div
                className={`mt-0.5 truncate font-mono text-xs font-semibold ${
                  v.missing ? 'text-slate-500' : energy ? 'text-cyan-800' : 'text-slate-900'
                }`}
                title={v.reason || String(v.text)}
              >
                {v.text}
              </div>
            </div>
          );
        })}
      </div>

      {!hasAny ? (
        <p className="mt-3 text-[11px] text-amber-800">{stateExplain(opportunity, backendOffline)}</p>
      ) : (
        <p className="mt-3 text-[10px] text-slate-500">{stateExplain(opportunity, backendOffline)}</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-600">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              opportunity.dataState === 'LIVE' ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          {tel || opportunity.dataState || 'TELEMETRY'}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 group-hover:text-violet-900 transition-colors">
          Open
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
};
