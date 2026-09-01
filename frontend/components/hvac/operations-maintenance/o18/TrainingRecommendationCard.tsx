'use client';

import { useState } from 'react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatKwh, formatPercent } from '@/lib/hvac/formatters';
import {
  o18Affected,
  o18Coverage,
  o18EnergyImpact,
  o18Gaps,
  o18RecStatus,
} from '@/lib/hvac/o18Format';

export function TrainingRecommendationCard({ data }: { data: OmOpportunity }) {
  const gaps = o18Gaps(data);
  const items =
    gaps && gaps.length
      ? gaps.map((gap) => ({
          title: data.recommendation?.action || 'ASSIGN_TRAINING',
          reason: gap,
          status: o18RecStatus(data.recommendation?.action),
        }))
      : data.recommendation?.action
        ? [
            {
              title: data.recommendation.action,
              reason: data.recommendation.rationale || '—',
              status: o18RecStatus(data.recommendation.action),
            },
          ]
        : [];

  return (
    <section id="o18-recommendations" className="space-y-3" aria-label="Training recommendations">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Training recommendations</h2>
      {items.length === 0 ? (
        <div className="kpi-tile text-[11px] font-mono text-amber-700">NO DATA AVAILABLE</div>
      ) : (
        items.map((item, i) => <Card key={`${item.title}-${i}`} data={data} item={item} />)
      )}
    </section>
  );
}

function Card({
  data,
  item,
}: {
  data: OmOpportunity;
  item: { title: string; reason: string; status: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="kpi-tile space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{formatDash(item.title)}</h3>
        <StatusBadge tone={toneForStatus(item.status)}>{item.status}</StatusBadge>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Reason</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(item.reason)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Affected Users</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(o18Affected(data))}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Required Action</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.recommendation?.action)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Expected Awareness Impact</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatPercent(o18Coverage(data))}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Energy Impact</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatKwh(o18EnergyImpact(data), true)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Priority</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.recommendation?.priority || data.priority)}</dd>
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
            <span className="text-slate-500">Current State: </span>
            {formatDash(data.supervisory?.currentState || data.current?.operatorReadiness)}
          </p>
          <p>
            <span className="text-slate-500">Observed Gap: </span>
            {formatDash(item.reason)}
          </p>
          <p>
            <span className="text-slate-500">Recommended Action: </span>
            {formatDash(data.supervisory?.recommendedState || data.recommendation?.action)}
          </p>
          <p>
            <span className="text-slate-500">Expected Outcome: </span>
            {formatDash(data.recommendation?.rationale)}
          </p>
          <p>
            <span className="text-slate-500">Supporting Data: </span>
            {(data.recommendation?.evidence || []).filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ) : null}
    </article>
  );
}
