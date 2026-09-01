'use client';

import { useMemo, useState } from 'react';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o19EquipmentRows, o19SecondsAgo } from '@/lib/hvac/o19Format';

export function MaintenanceEngineeringTable({ data, onSelect }: { data: OmOpportunity; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<'equipment' | 'condition' | 'priority' | 'status'>('equipment');
  const [asc, setAsc] = useState(true);
  const rows = useMemo(() => {
    const list = o19EquipmentRows(data) || [];
    return list.map((r) => ({
      equipment: r.id,
      condition: formatPercent(r.health),
      indicator: r.indicator,
      value: formatPercent(r.health),
      deviation: r.status === 'NORMAL' ? '—' : r.indicator,
      priority: r.priority || '—',
      recommendation: data.recommendation?.action || '—',
      lastSeen: o19SecondsAgo(r.lastSeen),
      status: r.status,
    }));
  }, [data]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (filter !== 'ALL' && r.status !== filter) return false;
      if (!needle) return true;
      return Object.values(r).some((v) => v.toLowerCase().includes(needle));
    });
    return [...filtered].sort((a, b) => (asc ? a[sortKey].localeCompare(b[sortKey]) : b[sortKey].localeCompare(a[sortKey])));
  }, [asc, filter, q, rows, sortKey]);

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Engineering table">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Engineering table</h2>
      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <label className="text-[11px] text-slate-500 flex-1">
          Search
          <input className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search equipment" />
        </label>
        <label className="text-[11px] text-slate-500">
          Filter
          <select className="mt-1 block bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['ALL', ...Array.from(new Set(rows.map((r) => r.status)))].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <EngineeringTable>
        <thead>
          <tr>
            {(['equipment', 'condition', 'priority', 'status'] as const).map((key) => (
              <th key={key}>
                <button
                  type="button"
                  className="font-semibold focus-visible:ring-2 focus-visible:ring-cyan-400"
                  onClick={() => {
                    if (sortKey === key) setAsc((v) => !v);
                    else {
                      setSortKey(key);
                      setAsc(true);
                    }
                  }}
                >
                  {key === 'equipment' ? 'Equipment' : key === 'condition' ? 'Condition' : key === 'priority' ? 'Priority' : 'Status'}
                  {sortKey === key ? (asc ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
            <th>Indicator</th>
            <th>Value</th>
            <th>Deviation</th>
            <th>Recommendation</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-amber-300">
                NO DATA AVAILABLE
              </td>
            </tr>
          ) : (
            visible.map((r) => (
              <tr key={r.equipment} className="cursor-pointer" onClick={() => onSelect(r.equipment)}>
                <td className="font-mono">{r.equipment}</td>
                <td className="font-mono">{r.condition}</td>
                <td>
                  <StatusBadge tone={toneForStatus(r.priority)}>{r.priority}</StatusBadge>
                </td>
                <td>
                  <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge>
                </td>
                <td>{r.indicator}</td>
                <td className="font-mono">{r.value}</td>
                <td>{r.deviation}</td>
                <td>{r.recommendation}</td>
                <td className="font-mono">{r.lastSeen}</td>
              </tr>
            ))
          )}
        </tbody>
      </EngineeringTable>
    </section>
  );
}
