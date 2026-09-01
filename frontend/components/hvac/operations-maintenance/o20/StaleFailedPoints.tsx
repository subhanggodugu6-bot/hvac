'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o20ControllerField, o20Counts, o20SecondsAgo } from '@/lib/hvac/o20Format';

export function StaleFailedPoints({ data }: { data: OmOpportunity }) {
  const c = o20Counts(data);
  const items: Array<{ kind: string; count: number; action: string; priority: string }> = [];
  if (c.stale != null && c.stale > 0) {
    items.push({ kind: 'STALE', count: c.stale, action: 'INVESTIGATE_STALE_POINTS', priority: 'MEDIUM' });
  }
  if (c.failed != null && c.failed > 0) {
    items.push({ kind: 'FAILED', count: c.failed, action: 'RESTORE_FAILED_POINTS', priority: 'HIGH' });
  }
  return (
    <section className="kpi-tile space-y-3" aria-label="Stale and failed points">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Stale / failed points</h2>
      {items.length === 0 ? (
        <EmptyState title="NO DATA AVAILABLE" detail="Stale and failed point identities were not returned. Counts appear in KPIs only when the API provides them." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map((it) => (
            <article key={it.kind} className="border border-rose-500/30 bg-rose-500/5 px-3 py-2">
              <div className="flex justify-between gap-2">
                <span className="font-mono text-xs text-rose-200">{it.kind} · {it.count} pts</span>
                <StatusBadge tone="danger">{it.priority}</StatusBadge>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px] font-mono text-slate-600">
                <div>Equipment {o20ControllerField(data, 'controller_id')}</div>
                <div>Last seen {o20SecondsAgo(data.telemetry?.lastUpdated || data.timestamp)}</div>
                <div>Quality {formatDash(data.telemetry?.quality)}</div>
                <div>Failure {it.kind}</div>
                <div>Duration —</div>
                <div>Action {it.action}</div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
