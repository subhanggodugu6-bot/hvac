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
  ReferenceLine,
  CHART_COLORS,
} from '@/components/hvac/EngineeringChart';
import type { O16Dashboard, O16HistoryPoint } from '@/lib/hvac/o16Types';
import { fmtDash, isSimulation } from '@/lib/hvac/o16Format';

export function PressureEnergyOptimizationChart({ data, points }: { data: O16Dashboard; points: O16HistoryPoint[] }) {
  const hist = points
    .filter((p) => p.head_pressure != null && p.pump_power != null)
    .map((p) => ({ hp: p.head_pressure, kw: p.pump_power }));
  const cs = data.current_state || {};
  const current =
    cs.head_pressure != null && cs.pump_power_kw != null ? [{ hp: cs.head_pressure, kw: cs.pump_power_kw }] : [];
  const recHp = data.optimized_state?.recommended_head_pressure;
  const recKw = data.predicted_pump_power_kw;
  const recommended = recHp != null && recKw != null ? [{ hp: recHp, kw: recKw }] : [];
  const sim = isSimulation(data);
  return (
    <section className="kpi-tile space-y-2 col-span-12" aria-labelledby="o16-hp-e">
      <h2 id="o16-hp-e" className="text-sm font-semibold text-slate-900">
        Head Pressure vs Energy
      </h2>
      <p className="text-[11px] text-slate-500">
        Pump power versus condensing pressure from persisted snapshots. No synthetic compressor curve is drawn.
      </p>
      {sim && <div className="text-[11px] font-semibold text-amber-300">SIMULATED — not production LIVE</div>}
      {!hist.length && !current.length && !recommended.length ? (
        <EmptyState title="No telemetry available" detail="Paired pressure and power samples are required." />
      ) : (
        <EngineeringChart height={240}>
          <ScatterChart>
            <CartesianGrid stroke={CHART_COLORS.grid} />
            <XAxis dataKey="hp" name="Condensing Pressure" stroke={CHART_COLORS.axis} />
            <YAxis dataKey="kw" name="Pump power kW" stroke={CHART_COLORS.axis} />
            <Tooltip formatter={(v: unknown) => fmtDash(v)} />
            {data.config?.min_head_pressure != null ? (
              <ReferenceLine x={Number(data.config.min_head_pressure)} stroke="#f43f5e" strokeDasharray="4 4" />
            ) : null}
            {data.config?.max_head_pressure != null ? (
              <ReferenceLine x={Number(data.config.max_head_pressure)} stroke="#f59e0b" strokeDasharray="4 4" />
            ) : null}
            {hist.length ? <Scatter name="Historical" data={hist} fill={CHART_COLORS.baseline} /> : null}
            {current.length ? <Scatter name="Current operating point" data={current} fill={CHART_COLORS.current} /> : null}
            {recommended.length ? <Scatter name="Recommended operating point" data={recommended} fill={CHART_COLORS.optimized} /> : null}
          </ScatterChart>
        </EngineeringChart>
      )}
    </section>
  );
}
