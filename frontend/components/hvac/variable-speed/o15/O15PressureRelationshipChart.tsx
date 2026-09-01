'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import {
  EngineeringChart,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  CHART_COLORS,
} from '@/components/hvac/EngineeringChart';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import type { O15HistoryPoint } from '@/lib/hvac/o15Types';
import { fmtDash } from '@/lib/hvac/o15Format';

export function O15PressureRelationshipChart({ data, points }: { data: O15Dashboard; points: O15HistoryPoint[] }) {
  const series = points
    .filter((p) => p.outdoor_air_temperature != null && p.head_pressure != null)
    .map((p) => ({ oat: p.outdoor_air_temperature, hp: p.head_pressure }));
  const cs = data.current_state || {};
  const current =
    cs.outdoor_temperature_c != null && cs.head_pressure != null
      ? [{ oat: cs.outdoor_temperature_c, hp: cs.head_pressure }]
      : [];
  return (
    <section className="kpi-tile space-y-2" aria-labelledby="o15-oat-hp">
      <h2 id="o15-oat-hp" className="text-sm font-semibold text-slate-900">
        Outdoor Air Temperature vs Head Pressure
      </h2>
      <p className="text-[11px] text-slate-500">
        Historical operating points from persisted snapshots. Recommended region is shown only when the backend supplies it.
      </p>
      {!series.length && !current.length ? (
        <EmptyState title="No telemetry available" detail="Paired OAT and head-pressure samples are required." />
      ) : (
        <EngineeringChart height={240}>
          <ScatterChart>
            <CartesianGrid stroke={CHART_COLORS.grid} />
            <XAxis dataKey="oat" name="Outdoor Air Temperature" stroke={CHART_COLORS.axis} />
            <YAxis dataKey="hp" name="Head Pressure" stroke={CHART_COLORS.axis} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(v: unknown) => fmtDash(v)}
              labelFormatter={() => 'Operating point'}
            />
            {series.length ? <Scatter name="Historical" data={series} fill={CHART_COLORS.baseline} /> : null}
            {current.length ? <Scatter name="Current" data={current} fill={CHART_COLORS.current} /> : null}
          </ScatterChart>
        </EngineeringChart>
      )}
    </section>
  );
}
