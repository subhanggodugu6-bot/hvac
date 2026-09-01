'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/hvac/EmptyState';
import {
  Bar,
  BarChart,
  CartesianGrid,
  CHART_COLORS,
  EngineeringChart,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from '@/components/hvac/EngineeringChart';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { metricNum } from '@/lib/hvac/omTypes';
import { o19Health } from '@/lib/hvac/o19Format';

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
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name}>
          {p.name}: {p.value == null ? '—' : p.value}
        </div>
      ))}
    </div>
  );
}

export function MaintenanceTrendChart({ data }: { data: OmOpportunity }) {
  const [range, setRange] = useState<Range>('24H');
  const health = o19Health(data);
  const dp = metricNum(data.metrics, 'filter_dp_rise_pct');
  const fan = metricNum(data.metrics, 'fan_power_kw');
  const snapshot: Array<Record<string, number | string>> = [{ name: 'Snapshot' }];
  if (health != null) snapshot[0].Health = health;
  if (dp != null) snapshot[0].FilterDpRise = dp;
  if (fan != null) snapshot[0].FanKw = fan;
  const has = health != null || dp != null || fan != null;

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Maintenance charts">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Condition / indicator / events</h2>
          <p className="text-[11px] text-slate-500 mt-1">Historian trends are not on this contract. Snapshot values only.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {(['24H', '7D', '30D', '90D'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              className={`px-2 py-1 text-[11px] font-mono border focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                range === r ? 'border-cyan-500/40 text-cyan-800' : 'border-slate-200 text-slate-400'
              }`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <EmptyState title="NO DATA AVAILABLE" detail={`${range} equipment-condition, indicator, cycling, and sensor-behavior series are not provided by GET /api/hvac/operations-maintenance/O19.`} />
      {has ? (
        <EngineeringChart height={200}>
          <BarChart data={snapshot}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="name" stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} />
            <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} width={36} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {health != null ? <Bar dataKey="Health" name="Health %" fill={CHART_COLORS.current} radius={[2, 2, 0, 0]} /> : null}
            {dp != null ? <Bar dataKey="FilterDpRise" name="Filter ΔP rise %" fill={CHART_COLORS.optimized} radius={[2, 2, 0, 0]} /> : null}
            {fan != null ? <Bar dataKey="FanKw" name="Fan kW" fill={CHART_COLORS.baseline} radius={[2, 2, 0, 0]} /> : null}
          </BarChart>
        </EngineeringChart>
      ) : null}
    </section>
  );
}
