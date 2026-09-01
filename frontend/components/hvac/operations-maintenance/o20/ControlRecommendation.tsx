'use client';

import { useState } from 'react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o20ConfidencePct, o20ControllerField, o20QualityLabel } from '@/lib/hvac/o20Format';

export function ControlRecommendation({ data }: { data: OmOpportunity }) {
  const [open, setOpen] = useState(false);
  if (!data.recommendation?.action) {
    return (
      <section className="kpi-tile">
        <EmptyState title="NO RECOMMENDATION" detail="Control recommendation action was not returned by the API." />
      </section>
    );
  }
  return (
    <section className="kpi-tile space-y-3" aria-label="Control recommendation">
      <div className="flex justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{formatDash(data.recommendation.action)}</h2>
        <StatusBadge tone={toneForStatus(data.status)}>{formatDash(data.status)}</StatusBadge>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Affected Point</dt>
          <dd className="font-mono text-slate-800 mt-0.5">—</dd>
        </div>
        <div>
          <dt className="text-slate-500">Affected Equipment</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o20ControllerField(data, 'controller_id')}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-slate-500">Reason</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(data.recommendation.rationale)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Evidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{(data.recommendation.evidence || []).filter(Boolean).join(' · ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Risk</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.metrics?.change_risk)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Priority</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.priority)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o20ConfidencePct(data.confidence)}</dd>
        </div>
      </dl>
      <button type="button" className="text-[11px] font-mono text-cyan-800 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-cyan-400" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Why this recommendation?
      </button>
      {open ? (
        <div className="border border-slate-200 p-3 space-y-2 text-[12px] text-slate-700">
          <p><span className="text-slate-500">Observed state: </span>{formatDash(data.supervisory?.currentState || data.current?.controllerHealth)}</p>
          <p><span className="text-slate-500">Expected state: </span>{formatDash(data.supervisory?.recommendedState)}</p>
          <p><span className="text-slate-500">Detected issue: </span>{formatDash(data.recommendation.rationale)}</p>
          <p><span className="text-slate-500">Supporting telemetry: </span>{o20QualityLabel(data)}</p>
          <p><span className="text-slate-500">Safety considerations: </span>{formatDash(data.safety?.status)} · automatic logic deploy is prohibited.</p>
        </div>
      ) : null}
    </section>
  );
}
