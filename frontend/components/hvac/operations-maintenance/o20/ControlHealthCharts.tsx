'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/hvac/EmptyState';
import {
  Bar,
  BarChart,
  CartesianGrid,
  CHART_COLORS,
  EngineeringChart,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from '@/components/hvac/EngineeringChart';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { o20Counts } from '@/lib/hvac/o20Format';

type Range = '24H' | '7D' | '30D' | '90D';

interface TipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  label?: string;
}

function Tip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 px-2.5 py-2 text-[11px] font-mono">
      <div className="text-slate-600 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name}>
          {p.name}: {p.value == null ? '—' : p.value}
        </div>
      ))}
    </div>
  );
}

export function ControlHealthCharts({ data }: { data: OmOpportunity }) {
  const [range, setRange] = useState<Range>('24H');
  const c = o20Counts(data);
  const trend = data.series?.controlHealth?.[range] ?? [];
  const hasTrend = trend.length > 0;
  const row = useMemo(() => {
    const snap: Record<string, number | string> = { name: 'Snapshot' };
    if (c.healthPct != null) snap.Health = c.healthPct;
    if (c.overrides != null) snap.Overrides = c.overrides;
    if (c.drift != null) snap.Drift = c.drift;
    if (c.stale != null) snap.Stale = c.stale;
    if (c.failed != null) snap.Failed = c.failed;
    return snap;
  }, [c]);
  const has = Object.keys(row).length > 1;

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Control health charts">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Control health charts</h2>
          <p className="text-[11px] text-slate-500 mt-1">Health, overrides, drift, stale, and failed point counts.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {(['24H', '7D', '30D', '90D'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              className={`px-2 py-1 text-[11px] font-mono border focus-visible:ring-2 focus-visible:ring-cyan-400 ${range === r ? 'border-cyan-500/40 text-cyan-800' : 'border-slate-200 text-slate-600'}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {hasTrend ? (
        <EngineeringChart height={220}>
          <LineChart data={trend}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="label" stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} />
            <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} width={36} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {c.healthPct != null ? <Line type="monotone" dataKey="health" name="Health %" stroke={CHART_COLORS.current} dot={false} /> : null}
            {c.overrides != null ? <Line type="monotone" dataKey="overrides" name="Overrides" stroke={CHART_COLORS.optimized} dot={false} /> : null}
            {c.drift != null ? <Line type="monotone" dataKey="drift" name="Drift" stroke={CHART_COLORS.baseline} dot={false} /> : null}
            {c.stale != null ? <Line type="monotone" dataKey="stale" name="Stale" stroke="#94a3b8" dot={false} /> : null}
            {c.failed != null ? <Line type="monotone" dataKey="failed" name="Failed" stroke="#f43f5e" dot={false} /> : null}
          </LineChart>
        </EngineeringChart>
      ) : (
        <EmptyState title="NO DATA AVAILABLE" detail={`${range} control-health series unavailable.`} />
      )}
      {has ? (
        <EngineeringChart height={200}>
          <BarChart data={[row]}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="name" stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} />
            <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} width={36} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {c.healthPct != null ? <Bar dataKey="Health" fill={CHART_COLORS.current} radius={[2, 2, 0, 0]} /> : null}
            {c.overrides != null ? <Bar dataKey="Overrides" fill={CHART_COLORS.optimized} radius={[2, 2, 0, 0]} /> : null}
            {c.drift != null ? <Bar dataKey="Drift" fill={CHART_COLORS.baseline} radius={[2, 2, 0, 0]} /> : null}
            {c.stale != null ? <Bar dataKey="Stale" fill="#94a3b8" radius={[2, 2, 0, 0]} /> : null}
            {c.failed != null ? <Bar dataKey="Failed" fill="#f43f5e" radius={[2, 2, 0, 0]} /> : null}
          </BarChart>
        </EngineeringChart>
      ) : null}
    </section>
  );
}
