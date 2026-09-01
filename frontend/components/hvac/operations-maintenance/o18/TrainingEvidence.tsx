'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o18Gaps, o18Programs, o18SecondsAgo } from '@/lib/hvac/o18Format';

export function TrainingEvidence({ data }: { data: OmOpportunity }) {
  const programs = o18Programs(data);
  const gaps = o18Gaps(data);
  const evidence = (data.recommendation?.evidence || []).filter(Boolean);
  return (
    <section className="kpi-tile space-y-3" aria-label="Evidence and details">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Evidence / details</h2>
      <dl className="space-y-2 text-[12px] text-slate-700">
        <div>
          <dt className="text-slate-500">Supporting evidence</dt>
          <dd className="mt-0.5 font-mono">{evidence.length ? evidence.join(' · ') : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Knowledge gaps</dt>
          <dd className="mt-0.5">{gaps && gaps.length ? gaps.join('; ') : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Manual overrides</dt>
          <dd className="mt-0.5 font-mono">{formatDash(data.current?.overrides ?? data.metrics?.manual_override_count)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Programs returned</dt>
          <dd className="mt-0.5 font-mono">{programs == null ? '—' : String(programs.length)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Last evaluation</dt>
          <dd className="mt-0.5 font-mono">{o18SecondsAgo(data.timestamp || data.telemetry?.lastUpdated)}</dd>
        </div>
      </dl>
      {!evidence.length && !programs ? (
        <EmptyState title="NO DATA AVAILABLE" detail="No training evidence payload was returned." />
      ) : null}
    </section>
  );
}
