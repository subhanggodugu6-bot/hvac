'use client';

import { useMemo, useState } from 'react';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { EmptyState } from '@/components/hvac/EmptyState';
import { formatDash } from '@/lib/hvac/formatters';
import type { OmControlPoint, OmOpportunity } from '@/lib/hvac/omTypes';

type Filter = 'All' | 'Healthy' | 'Override' | 'Drift' | 'Stale' | 'Failed';

function matchesFilter(row: OmControlPoint, filter: Filter): boolean {
  if (filter === 'All') return true;
  const s = (row.status || '').toUpperCase();
  if (filter === 'Healthy') return s === 'HEALTHY';
  if (filter === 'Override') return row.override || s === 'OVERRIDE';
  if (filter === 'Drift') return row.drift || s.includes('DRIFT');
  if (filter === 'Stale') return s === 'STALE';
  if (filter === 'Failed') return s === 'FAILED';
  return true;
}

export function ControlPointTable({ data }: { data: OmOpportunity }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const rows = data.controlPoints ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (!needle) return true;
      return [row.point, row.equipment, row.pointType, row.status]
        .some((v) => String(v || '').toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Control point table">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Control point table</h2>
      <p className="text-[11px] text-slate-500">
        {rows.length} control points from O20 governance telemetry.
      </p>
      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <label className="text-[11px] text-slate-500 flex-1">
          Search
          <input
            className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search points"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Point filter">
          {(['All', 'Healthy', 'Override', 'Drift', 'Stale', 'Failed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={`px-2 py-1.5 text-[11px] font-mono border focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                filter === f ? 'border-cyan-500/40 text-cyan-800' : 'border-slate-200 text-slate-600'
              }`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <EngineeringTable>
          <thead>
            <tr>
              <th>Point</th>
              <th>Equipment</th>
              <th>Point Type</th>
              <th>Current Value</th>
              <th>Expected/Reference</th>
              <th>Quality</th>
              <th>Override</th>
              <th>Drift</th>
              <th>Last Seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.point}>
                <td className="font-mono text-xs">{formatDash(row.point)}</td>
                <td>{formatDash(row.equipment)}</td>
                <td>{formatDash(row.pointType)}</td>
                <td className="font-mono">{formatDash(row.currentValue)}</td>
                <td className="font-mono">{formatDash(row.referenceValue)}</td>
                <td>{formatDash(row.quality)}</td>
                <td>{row.override ? 'YES' : '—'}</td>
                <td>{row.drift ? 'YES' : '—'}</td>
                <td className="font-mono text-[10px]">{formatDash(row.lastSeen)}</td>
                <td>{formatDash(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </EngineeringTable>
      ) : (
        <EmptyState title="NO DATA AVAILABLE" detail="No control points match the selected filter." />
      )}
    </section>
  );
}
