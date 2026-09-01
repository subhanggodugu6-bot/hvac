'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import {
  EngineeringChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  CHART_COLORS,
} from '@/components/hvac/EngineeringChart';
import type { O15HistoryPoint } from '@/lib/hvac/o15Types';
import { fmtDash } from '@/lib/hvac/o15Format';

function stats(points: O15HistoryPoint[], key: keyof O15HistoryPoint) {
  const nums = points.map((p) => p[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return { current: null as number | null, avg: null as number | null, min: null as number | null, max: null as number | null };
  return {
    current: nums[nums.length - 1],
    avg: nums.reduce((a, b) => a + b, 0) / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

function PressureTooltip({
  active,
  payload,
  label,
  recommendedTarget,
}: {
  active?: boolean;
  payload?: Array<{ payload?: O15HistoryPoint }>;
  label?: string;
  recommendedTarget?: number | null;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-white border border-slate-200 px-2.5 py-2 text-[11px] font-mono">
      <div className="text-slate-600 mb-1">{label}</div>
      <div>Current pressure: {fmtDash(p?.head_pressure)}</div>
      <div>Target: {fmtDash(p?.head_pressure_setpoint)}</div>
      <div>Recommended target: {fmtDash(recommendedTarget)}</div>
      <div>Outdoor temperature: {fmtDash(p?.outdoor_air_temperature)}</div>
    </div>
  );
}

export function O15HeadPressureChart({
  points,
  hours,
  onHours,
  recommendedTarget,
}: {
  points: O15HistoryPoint[];
  hours: number;
  onHours: (h: number) => void;
  recommendedTarget?: number | null;
}) {
  const hp = stats(points, 'head_pressure');
  return (
    <section className="kpi-tile space-y-3" aria-labelledby="o15-hp-trend">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="o15-hp-trend" className="text-sm font-semibold text-slate-900">
          Head Pressure Trend
        </h2>
        <div className="flex gap-1" role="tablist" aria-label="Trend window">
          {[
            [1, '1H'],
            [6, '6H'],
            [24, '24H'],
            [168, '7D'],
          ].map(([h, label]) => (
            <button
              key={String(h)}
              type="button"
              className={`px-2 py-1 text-[11px] font-mono border focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                hours === h ? 'border-cyan-400 text-cyan-800' : 'border-slate-200 text-slate-600'
              }`}
              onClick={() => onHours(Number(h))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-[11px] font-mono text-slate-600">
        <div>Current {fmtDash(hp.current)}</div>
        <div>Average {fmtDash(hp.avg)}</div>
        <div>Minimum {fmtDash(hp.min)}</div>
        <div>Maximum {fmtDash(hp.max)}</div>
      </div>
      {!points.length ? (
        <EmptyState title="No telemetry available" detail="Historian snapshots are empty. Nothing is fabricated." />
      ) : (
        <EngineeringChart height={260}>
          <LineChart data={points}>
            <CartesianGrid stroke={CHART_COLORS.grid} />
            <XAxis dataKey="timestamp" hide />
            <YAxis stroke={CHART_COLORS.axis} />
            <Tooltip content={<PressureTooltip recommendedTarget={recommendedTarget} />} />
            <Legend />
            {recommendedTarget != null && Number.isFinite(Number(recommendedTarget)) ? (
              <ReferenceLine y={Number(recommendedTarget)} stroke="#fbbf24" strokeDasharray="4 4" name="Recommended Target" />
            ) : null}
            <Line type="monotone" dataKey="head_pressure" name="Current Head Pressure" stroke={CHART_COLORS.current} dot={false} />
            <Line type="monotone" dataKey="head_pressure_setpoint" name="Target Head Pressure" stroke={CHART_COLORS.optimized} dot={false} />
            {points.some((p) => p.outdoor_air_temperature != null) ? (
              <Line type="monotone" dataKey="outdoor_air_temperature" name="Outdoor Air Temperature" stroke={CHART_COLORS.baseline} dot={false} />
            ) : null}
          </LineChart>
        </EngineeringChart>
      )}
    </section>
  );
}
