'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o20ConfidencePct, o20Decision, o20QualityLabel } from '@/lib/hvac/o20Format';

export function ControlDecisionPanel({ data }: { data: OmOpportunity }) {
  const decision = o20Decision(data);
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
          <dd className="font-mono text-slate-800 mt-0.5">{o20ConfidencePct(data.confidence)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Telemetry Quality</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o20QualityLabel(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Safety</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.safety?.status)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Current State</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.supervisory?.currentState || data.current?.controllerHealth)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recommended State</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.supervisory?.recommendedState)}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-slate-500">No automatic BMS or firmware write from this panel.</p>
    </aside>
  );
}
