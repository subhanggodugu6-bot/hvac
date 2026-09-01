'use client';

import { useState } from 'react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity, TelemetryValue } from '@/lib/hvac/omTypes';
import { formatDash, formatKw } from '@/lib/hvac/formatters';
import { o19ConfidencePct, o19Issues, o19QualityLabel } from '@/lib/hvac/o19Format';

export function MaintenanceRecommendation({ data }: { data: OmOpportunity }) {
  const issues = o19Issues(data);
  const cards =
    issues && issues.length
      ? issues
      : data.recommendation?.action
        ? [
            {
              finding: data.recommendation.rationale ?? null,
              energyImpactKw: data.energy?.impactKw ?? null,
              priority: data.priority ?? null,
              equipmentId: null,
              issueType: data.recommendation.action,
            },
          ]
        : [];
  return (
    <section className="col-span-12 space-y-3" aria-label="Maintenance recommendations">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Maintenance recommendation</h2>
      {cards.length === 0 ? (
        <div className="kpi-tile text-[11px] font-mono text-amber-300">NO DATA AVAILABLE</div>
      ) : (
        cards.map((c, i) => <Card key={`${c.finding}-${i}`} data={data} issue={c} />)
      )}
    </section>
  );
}

function Card({
  data,
  issue,
}: {
  data: OmOpportunity;
  issue: { finding: string | null; energyImpactKw: TelemetryValue; priority: string | null; equipmentId: string | null; issueType: string | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="kpi-tile space-y-3">
      <div className="flex justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{formatDash(issue.issueType || data.recommendation?.action)}</h3>
        <StatusBadge tone={toneForStatus(issue.priority)}>{formatDash(issue.priority)}</StatusBadge>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Issue</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(issue.finding)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Evidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{(data.recommendation?.evidence || []).filter(Boolean).join(' · ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Engineering Reason</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(data.recommendation?.rationale)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recommended Maintenance</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(data.recommendation?.action)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Expected Outcome</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatKw(issue.energyImpactKw ?? data.energy?.impactKw)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19ConfidencePct(data.confidence)}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="text-[11px] font-mono text-cyan-800 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-cyan-400"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Why was this flagged?
      </button>
      {open ? (
        <div className="border border-slate-200 p-3 space-y-2 text-[12px] text-slate-700">
          <p>
            <span className="text-slate-500">Observed condition: </span>
            {formatDash(issue.finding)}
          </p>
          <p>
            <span className="text-slate-500">Historical condition: </span>—
          </p>
          <p>
            <span className="text-slate-500">Threshold/limit: </span>
            Filter ΔP rise ≥ 20% (urgent ≥ 50%); sensor drift ≥ 5%; cycling ≥ 8 in the evaluation window.
          </p>
          <p>
            <span className="text-slate-500">Data quality: </span>
            {o19QualityLabel(data)}
          </p>
          <p>
            <span className="text-slate-500">Supporting evidence: </span>
            {(data.recommendation?.evidence || []).filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ) : null}
    </article>
  );
}
