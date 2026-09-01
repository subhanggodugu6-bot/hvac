'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import { o19EquipmentRows, o19Issues } from '@/lib/hvac/o19Format';

export function MaintenancePriorityPanel({
  data,
  onSelect,
}: {
  data: OmOpportunity;
  onSelect: (id: string) => void;
}) {
  const issues = o19Issues(data);
  const rows = o19EquipmentRows(data) || [];
  const ranked = [...rows].sort((a, b) => {
    const rank = (s: string) => (s.includes('URGENT') ? 3 : s.includes('MAINTENANCE') ? 2 : s === 'MONITOR' ? 1 : 0);
    return rank(b.status) - rank(a.status);
  });
  return (
    <section className="kpi-tile space-y-3 h-full" aria-label="Maintenance priority">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Maintenance priority</h2>
      {ranked.length === 0 && !issues?.length ? (
        <EmptyState title="NO DATA AVAILABLE" detail="No ranked maintenance items were returned." />
      ) : (
        <ul className="space-y-2">
          {ranked.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full text-left border border-slate-200 px-3 py-2 focus-visible:ring-2 focus-visible:ring-cyan-400"
                onClick={() => onSelect(r.id)}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs text-slate-800">{r.id}</span>
                  <StatusBadge tone={toneForStatus(r.status)}>{r.status.replace(/ /g, '_')}</StatusBadge>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{formatDash(r.indicator)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {issues && issues[0] ? (
        <p className="text-[11px] text-slate-500">{formatDash(issues[0].finding)}</p>
      ) : null}
    </section>
  );
}
