'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { Cell, EngineeringChart, Pie, PieChart } from '@/components/hvac/EngineeringChart';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o20Counts } from '@/lib/hvac/o20Format';

const COLORS: Record<string, string> = {
  Healthy: '#34d399',
  Warning: '#fbbf24',
  Drift: '#22d3ee',
  Stale: '#94a3b8',
  Failed: '#f43f5e',
};

export function ControlHealthOverview({ data }: { data: OmOpportunity }) {
  const c = o20Counts(data);
  const slices = [
    { name: 'Healthy', value: c.healthy },
    { name: 'Warning', value: c.degraded },
    { name: 'Drift', value: c.drift },
    { name: 'Stale', value: c.stale },
    { name: 'Failed', value: c.failed },
  ].filter((s) => s.value != null) as Array<{ name: string; value: number }>;

  return (
    <section className="kpi-tile space-y-3 h-full" aria-label="Control health overview">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Control health</h2>
      <div className="text-2xl font-mono text-slate-900">{formatPercent(c.healthPct)}</div>
      <p className="text-[11px] font-mono text-slate-500">Controller {formatDash(data.current?.controllerHealth)} · trend — (no historian)</p>
      {slices.length === 0 ? (
        <EmptyState title="NO DATA AVAILABLE" detail="Healthy / warning / drift / stale / failed counts were not returned." />
      ) : (
        <EngineeringChart height={200}>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} stroke="#090B12">
              {slices.map((s) => (
                <Cell key={s.name} fill={COLORS[s.name]} />
              ))}
            </Pie>
          </PieChart>
        </EngineeringChart>
      )}
      <ul className="grid grid-cols-2 gap-1 text-[11px] font-mono text-slate-600">
        {['Healthy', 'Warning', 'Drift', 'Stale', 'Failed'].map((name) => {
          const row = slices.find((s) => s.name === name);
          return (
            <li key={name}>
              {name} {row ? row.value : '—'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
