'use client';

import { useState } from 'react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { actionErrorText } from '@/lib/hvac/actionError';
import {
  o17ConfidencePct,
  o17Kw,
  o17QualityLabel,
  o17RecCardStatus,
  o17Safety,
} from '@/lib/hvac/o17Format';
import { useO17Mutations } from '@/hooks/useO17';

export function PlanningRecommendationCard({ data }: { data: OmOpportunity }) {
  const [open, setOpen] = useState(false);
  const { dispatchPlan } = useO17Mutations();
  const status = o17RecCardStatus(data);
  const eligible = Boolean(data.dispatch?.eligible);
  const reason = data.dispatch?.blockReason;

  return (
    <section id="o17-recommendation" className="kpi-tile space-y-3" aria-labelledby="o17-rec-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="o17-rec-title" className="text-[11px] uppercase tracking-wider text-slate-500">
            Planning recommendations
          </h2>
          <h3 className="text-sm font-semibold text-slate-900 mt-1">{formatDash(data.recommendation?.action)}</h3>
        </div>
        <StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Engineering reason</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(data.recommendation?.rationale)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Current condition</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.supervisory?.currentState)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recommended condition</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.supervisory?.recommendedState)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Expected energy impact</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17Kw(data.recommendation?.expectedImpactKw)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17ConfidencePct(data.recommendation?.confidence)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Supporting data</dt>
          <dd className="font-mono text-slate-800 mt-0.5">
            {(data.recommendation?.evidence || []).length
              ? (data.recommendation?.evidence || []).join(' · ')
              : '—'}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className="text-[11px] font-mono text-cyan-800 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-cyan-400"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Why this recommendation?
      </button>
      {open ? (
        <div className="border border-slate-200 p-3 space-y-2 text-[12px] text-slate-700">
          <p>
            <span className="text-slate-500">Current state: </span>
            {formatDash(data.supervisory?.currentState)}
          </p>
          <p>
            <span className="text-slate-500">Target state: </span>
            {formatDash(data.supervisory?.recommendedState)}
          </p>
          <p>
            <span className="text-slate-500">Energy rationale: </span>
            {formatDash(data.recommendation?.rationale)}
          </p>
          <p>
            <span className="text-slate-500">Safety checks: </span>
            {o17Safety(data)}
          </p>
          <p>
            <span className="text-slate-500">Data quality: </span>
            {o17QualityLabel(data)}
          </p>
          <p>
            <span className="text-slate-500">Constraints: </span>
            {formatDash(reason || data.dispatch?.blockCode || data.dispatch?.status)} · advisory planning action {formatDash(data.dispatch?.actionType)}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-40"
          disabled={!eligible || dispatchPlan.isPending}
          title={eligible ? 'Records a planning dispatch. Does not write BMS setpoints from this page.' : formatDash(reason)}
          onClick={() => dispatchPlan.mutate({})}
        >
          Record planning action
        </button>
        {!eligible ? (
          <span className="text-[11px] font-mono text-amber-800">{formatDash(reason)}</span>
        ) : (
          <span className="text-[11px] text-slate-500">Advisory PLAN_DISPATCH only. No automatic BMS control from this UI.</span>
        )}
      </div>
      {dispatchPlan.isError ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {actionErrorText(dispatchPlan.error)}
        </p>
      ) : null}
    </section>
  );
}
