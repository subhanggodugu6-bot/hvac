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
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { o18Coverage, o18EnergyImpact } from '@/lib/hvac/o18Format';

type Range = '7D' | '30D' | '90D';

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
        <div key={p.name} className="text-slate-800">
          {p.name}: {p.value == null ? '—' : p.value}
        </div>
      ))}
    </div>
  );
}

export function EnergyAwarenessChart({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const [range, setRange] = useState<Range>('30D');
  const completion = o18Coverage(data) ?? dash?.charts?.training?.completion ?? null;
  const impact = o18EnergyImpact(data);
  const hasSnapshot = completion != null || impact != null;

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Energy awareness impact">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Energy awareness impact</h2>
          <p className="text-[11px] text-slate-500 mt-1">Training / awareness activity versus energy impact. Historian series are not on this contract.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Impact time range">
          {(['7D', '30D', '90D'] as const).map((r) => (
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
      <EmptyState title="Insufficient data for impact analysis" detail={`${range} paired training-versus-energy time series are not provided by GET /api/hvac/operations-maintenance/O18.`} />
      {hasSnapshot ? (
        <EngineeringChart height={200}>
          <BarChart data={[{ name: 'Snapshot', ...(completion != null ? { Completion: completion } : {}), ...(impact != null ? { Impact: impact } : {}) }]}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="name" stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} />
            <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} width={36} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {completion != null ? (
              <Bar dataKey="Completion" name="Completion %" fill={CHART_COLORS.current} radius={[2, 2, 0, 0]} />
            ) : null}
            {impact != null ? (
              <Bar dataKey="Impact" name="Energy impact kWh/day" fill={CHART_COLORS.optimized} radius={[2, 2, 0, 0]} />
            ) : null}
          </BarChart>
        </EngineeringChart>
      ) : null}
    </section>
  );
}
