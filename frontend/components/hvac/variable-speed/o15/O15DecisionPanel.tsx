'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import { confidencePct, fmtDash, mapDecision } from '@/lib/hvac/o15Format';

export function O15DecisionPanel({ data }: { data: O15Dashboard }) {
  const decision = mapDecision(data);
  const conf = confidencePct(data.confidence);
  return (
    <section className="kpi-tile space-y-2" aria-labelledby="o15-decision">
      <h2 id="o15-decision" className="text-sm font-semibold text-slate-900">
        Supervisory Decision
      </h2>
      <StatusBadge tone={toneForStatus(decision)}>{decision}</StatusBadge>
      <p className="text-xs text-slate-700 leading-relaxed">{data.reason || '—'}</p>
      <div className="text-[11px] font-mono text-slate-600 space-y-0.5">
        <div>Confidence {conf}</div>
        <div>Engine O15</div>
        <div>Engine Version {fmtDash(data.engine_version)}</div>
        <div>Config Version {fmtDash(data.config?.config_version)}</div>
      </div>
    </section>
  );
}
