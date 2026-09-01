'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import {
  o17ConfidencePct,
  o17Decision,
  o17Freshness,
  o17QualityLabel,
  o17Safety,
} from '@/lib/hvac/o17Format';

export function PlanningDecisionPanel({ data }: { data: OmOpportunity }) {
  const decision = o17Decision(data);
  return (
    <aside className="kpi-tile space-y-3 h-full" aria-label="Supervisory decision">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Supervisory decision</h2>
      <StatusBadge tone={toneForStatus(decision)}>{decision}</StatusBadge>
      <dl className="space-y-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Decision</dt>
          <dd className="font-mono text-slate-900 mt-0.5">{decision}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Reason</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(data.supervisory?.reason)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17ConfidencePct(data.supervisory?.confidence ?? data.confidence)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Safety status</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17Safety(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Data quality</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17QualityLabel(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Telemetry freshness</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17Freshness(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Current state</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.supervisory?.currentState)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recommended state</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.supervisory?.recommendedState)}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Advisory energy-management planning. Direct BMS control is not issued from this panel.
      </p>
    </aside>
  );
}
