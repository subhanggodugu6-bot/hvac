'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o19EquipmentRows, o19SecondsAgo, type O19EquipmentRow } from '@/lib/hvac/o19Format';

export function EquipmentHealthGrid({
  data,
  selectedId,
  onSelect,
}: {
  data: OmOpportunity;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = o19EquipmentRows(data);
  const groups = new Map<string, O19EquipmentRow[]>();
  for (const r of rows || []) {
    const list = groups.get(r.type) || [];
    list.push(r);
    groups.set(r.type, list);
  }
  return (
    <section className="col-span-12 kpi-tile space-y-4" aria-label="Equipment health overview">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Equipment health overview</h2>
      {!rows ? (
        <EmptyState title="NO DATA AVAILABLE" detail="No equipment identifiers were returned. Categories are not invented." />
      ) : (
        Array.from(groups.entries()).map(([type, items]) => (
          <div key={type}>
            <h3 className="text-[11px] font-mono text-cyan-400 mb-2">{type}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {items.map((eq) => (
                <button
                  key={eq.id}
                  type="button"
                  onClick={() => onSelect(eq.id)}
                  className={`text-left border px-3 py-2 focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    selectedId === eq.id ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-slate-200'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs text-slate-800">{eq.id}</span>
                    <StatusBadge tone={toneForStatus(eq.status)}>{eq.status}</StatusBadge>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">{eq.name}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-500">
                    <div>Health {formatPercent(eq.health)}</div>
                    <div>Priority {formatDash(eq.priority)}</div>
                    <div className="col-span-2">Indicator {eq.indicator}</div>
                    <div className="col-span-2">Last seen {o19SecondsAgo(eq.lastSeen)}</div>
                  </dl>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
