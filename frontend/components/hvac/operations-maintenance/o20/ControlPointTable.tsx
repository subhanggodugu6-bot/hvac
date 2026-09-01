'use client';

import { useState } from 'react';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { EmptyState } from '@/components/hvac/EmptyState';
import type { OmOpportunity } from '@/lib/hvac/omTypes';

type Filter = 'All' | 'Healthy' | 'Override' | 'Drift' | 'Stale' | 'Failed';

export function ControlPointTable({ data }: { data: OmOpportunity }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const pointCount = Array.isArray(data.metrics?.points) ? (data.metrics?.points as unknown[]).length : 0;

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Control point table">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Control point table</h2>
      <p className="text-[11px] text-slate-500">
        Point-level BMS records are not included on GET /api/hvac/operations-maintenance/O20. Aggregates are shown in KPIs. Rows are not fabricated.
        {pointCount > 0 ? ` API listed ${pointCount} untyped point entries — not rendered as invented columns.` : ''}
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
                filter === f ? 'border-cyan-500/40 text-cyan-800' : 'border-slate-200 text-slate-400'
              }`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
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
        <tbody />
      </EngineeringTable>
      <EmptyState title="NO DATA AVAILABLE" detail="No individual control-point rows were returned for the selected filter." />
    </section>
  );
}
