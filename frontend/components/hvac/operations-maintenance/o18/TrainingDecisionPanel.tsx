'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o18ConfidencePct, o18Decision, o18QualityLabel } from '@/lib/hvac/o18Format';

export function TrainingDecisionPanel({ data }: { data: OmOpportunity }) {
  const decision = o18Decision(data);
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
          <dd className="font-mono text-slate-800 mt-0.5">{o18ConfidencePct(data.supervisory?.confidence ?? data.confidence)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Data quality</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o18QualityLabel(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recommendation</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.recommendation?.action)}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Advisory training opportunity. HVAC equipment dispatch and setpoint writes are not available on this page.
      </p>
    </aside>
  );
}
