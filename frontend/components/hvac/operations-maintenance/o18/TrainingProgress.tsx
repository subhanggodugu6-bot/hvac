'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o18Counts, o18Programs } from '@/lib/hvac/o18Format';

function Bar({ label, value, total, tone }: { label: string; value: number | null; total: number | null; tone: string }) {
  const pct = value == null || total == null || total === 0 ? null : Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
        <span>{label}</span>
        <span>{value == null ? '—' : value}</span>
      </div>
      <div className="h-1.5 bg-slate-200 overflow-hidden" aria-hidden>
        <div className={`h-full ${tone}`} style={{ width: pct == null ? '0%' : `${pct}%` }} />
      </div>
    </div>
  );
}

export function TrainingProgress({ data }: { data: OmOpportunity }) {
  const counts = o18Counts(o18Programs(data));
  return (
    <section className="col-span-12 kpi-tile space-y-4" aria-label="Training overview">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Training overview</h2>
      <p className="text-[11px] text-slate-500">Program records from the O&amp;M evaluator. This is not equipment control.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Training Items', value: counts.total },
          { label: 'Completed', value: counts.completed },
          { label: 'In Progress', value: counts.inProgress },
          { label: 'Pending', value: counts.pending },
        ].map((c) => (
          <div key={c.label} className="border border-slate-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
            <div className="text-lg font-mono text-slate-900 mt-1">{c.value == null ? '—' : c.value}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Bar label="Completed" value={counts.completed} total={counts.total} tone="bg-emerald-400/80" />
        <Bar label="In Progress" value={counts.inProgress} total={counts.total} tone="bg-cyan-400/80" />
        <Bar label="Pending" value={counts.pending} total={counts.total} tone="bg-amber-400/80" />
      </div>
      {counts.total == null ? (
        <EmptyState title="NO PROGRAMS" detail="Training program list was not returned." />
      ) : null}
      <p className="text-[10px] font-mono text-slate-600">Readiness {formatDash(data.current?.operatorReadiness)}</p>
    </section>
  );
}
