'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o19ConfidencePct, o19Decision, o19QualityLabel } from '@/lib/hvac/o19Format';

export function MaintenanceDecisionPanel({ data }: { data: OmOpportunity }) {
  const decision = o19Decision(data);
  return (
    <aside className="kpi-tile space-y-3 h-full" aria-label="Supervisory decision">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Supervisory decision</h2>
      <StatusBadge tone={toneForStatus(decision)}>{decision}</StatusBadge>
      <dl className="space-y-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Maintenance Decision</dt>
          <dd className="font-mono text-slate-900 mt-0.5">{decision}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Reason</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(data.supervisory?.reason)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Evidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{(data.recommendation?.evidence || []).filter(Boolean).join(' · ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Priority</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.priority)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19ConfidencePct(data.confidence)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Data Quality</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19QualityLabel(data)}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-slate-500">Advisory maintenance intelligence. Equipment setpoints are not modified from this panel.</p>
    </aside>
  );
}
