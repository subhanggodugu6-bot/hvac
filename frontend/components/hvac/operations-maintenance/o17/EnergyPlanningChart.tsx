'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/hvac/EmptyState';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  CHART_COLORS,
  EngineeringChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from '@/components/hvac/EngineeringChart';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { o17BaselineKw, o17CurrentKw, o17TargetKw } from '@/lib/hvac/o17Format';

type Range = '24H' | '7D' | '30D' | '90D';

interface TipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}

function SnapshotTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 px-2.5 py-2 text-[11px] font-mono">
      <div className="text-slate-600 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="text-slate-800">
          {p.name}: <span className="text-cyan-800">{p.value == null ? '—' : p.value}</span> kW
        </div>
      ))}
    </div>
  );
}

export function EnergyPlanningChart({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const [range, setRange] = useState<Range>('24H');
  const current = o17CurrentKw(data, dash);
  const baseline = o17BaselineKw(data, dash);
  const target = o17TargetKw(data, dash);
  const snapshot = useMemo(
    () => [
      { name: 'Baseline', value: baseline },
      { name: 'Actual', value: current },
      { name: 'Target', value: target },
    ],
    [baseline, current, target]
  );
  const hasSnapshot = current != null || baseline != null || target != null;

  return (
    <section className="col-span-12 kpi-tile" aria-label="Energy planning overview">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
        <div>
          <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Energy planning overview</h2>
          <p className="text-[11px] text-slate-500 mt-1">Snapshot comparison from the O&amp;M API. Historian series are not available on this contract.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {(['24H', '7D', '30D', '90D'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              className={`px-2 py-1 text-[11px] font-mono border focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                range === r ? 'border-cyan-500/40 text-cyan-800' : 'border-slate-200 text-slate-600'
              }`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-[220px]">
        <EmptyState
          title="NO DATA AVAILABLE"
          detail={`${range} energy historian series are not provided by GET /api/hvac/operations-maintenance/O17. Values are not fabricated.`}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Current period snapshot</h3>
          {!hasSnapshot ? (
            <EmptyState title="NO DATA AVAILABLE" detail="Baseline, actual, and target kW are missing." />
          ) : (
            <EngineeringChart height={220}>
              <BarChart data={[{ name: 'kW', Baseline: baseline, Actual: current, Target: target }]}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} />
                <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} width={42} />
                <Tooltip content={<SnapshotTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Baseline" fill={CHART_COLORS.baseline} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Actual" fill={CHART_COLORS.current} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Target" fill={CHART_COLORS.optimized} radius={[2, 2, 0, 0]} />
              </BarChart>
            </EngineeringChart>
          )}
        </div>
        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Baseline / actual / target</h3>
          {!hasSnapshot ? (
            <EmptyState title="NO DATA AVAILABLE" detail="Comparison series cannot be drawn without kW values." />
          ) : (
            <EngineeringChart height={220}>
              <AreaChart data={snapshot}>
                <CartesianGrid stroke={CHART_COLORS.grid} />
                <XAxis dataKey="name" stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} />
                <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} width={42} />
                <Tooltip content={<SnapshotTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="value" name="kW" stroke={CHART_COLORS.current} fill={CHART_COLORS.current} fillOpacity={0.15} />
                <Line type="monotone" dataKey="value" name="Trace" stroke={CHART_COLORS.optimized} dot strokeWidth={2} />
              </AreaChart>
            </EngineeringChart>
          )}
        </div>
      </div>
    </section>
  );
}
