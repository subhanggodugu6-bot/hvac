'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o17SecondsAgo } from '@/lib/hvac/o17Format';

export function PlanningActivityTimeline({ data }: { data: OmOpportunity }) {
  const events = data.audit || [];
  return (
    <section className="col-span-12 kpi-tile" aria-label="Recent activity">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Recent activity</h2>
      {events.length === 0 ? (
        <EmptyState title="NO DATA AVAILABLE" detail="No O17 audit events have been returned by the Operations & Maintenance API." />
      ) : (
        <ol className="space-y-2">
          {events.map((e, i) => (
            <li key={`${e.timestamp || 't'}-${i}`} className="border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap justify-between gap-2 text-[11px] font-mono text-slate-500">
                <span>{formatDash(e.event_type)}</span>
                <span>{o17SecondsAgo(e.timestamp)}</span>
              </div>
              <p className="text-[12px] text-slate-700 mt-1">{formatDash(e.message)}</p>
              <p className="text-[10px] font-mono text-slate-600 mt-1">
                {formatDash(e.actor)}
                {e.confidence != null ? ` · ${Math.round(e.confidence <= 1 ? e.confidence * 100 : e.confidence)}%` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
