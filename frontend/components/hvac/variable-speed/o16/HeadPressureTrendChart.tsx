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
import type { O16Dashboard, O16HistoryPoint } from '@/lib/hvac/o16Types';
import { fmtDash, isSimulation } from '@/lib/hvac/o16Format';

function PressureTooltip({
  active,
  payload,
  label,
  wetBulb,
  recommended,
}: {
  active?: boolean;
  payload?: Array<{ payload?: O16HistoryPoint }>;
  label?: string;
  wetBulb?: number | null;
  recommended?: number | null;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-white border border-slate-200 px-2.5 py-2 text-[11px] font-mono">
      <div className="text-slate-600 mb-1">{label}</div>
      <div>Actual {fmtDash(p?.head_pressure)}</div>
      <div>Target {fmtDash(recommended)}</div>
      <div>Outdoor/Wet bulb {fmtDash(wetBulb)}</div>
      <div>Condenser water temperature {fmtDash(p?.cw_supply)}</div>
    </div>
  );
}

export function HeadPressureTrendChart({
  data,
  points,
  hours,
  onHours,
}: {
  data: O16Dashboard;
  points: O16HistoryPoint[];
  hours: number;
  onHours: (h: number) => void;
}) {
  const sim = isSimulation(data);
  const rec = data.optimized_state?.recommended_head_pressure;
  return (
    <section className="kpi-tile space-y-3 col-span-12" aria-labelledby="o16-trend">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="o16-trend" className="text-sm font-semibold text-slate-900">
          Condensing Pressure — Trend
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
      {sim && <div className="text-[11px] font-semibold text-amber-800">SIMULATED TELEMETRY — historian excludes simulation snapshots</div>}
      {!points.length ? (
        <EmptyState title="No telemetry available" detail="Persisted O16 snapshots are empty. No series is fabricated." />
      ) : (
        <EngineeringChart height={260}>
          <LineChart data={points}>
            <CartesianGrid stroke={CHART_COLORS.grid} />
            <XAxis dataKey="timestamp" hide />
            <YAxis stroke={CHART_COLORS.axis} name="Pressure" />
            <Tooltip content={<PressureTooltip wetBulb={data.current_state?.outdoor_wet_bulb_c} recommended={rec} />} />
            <Legend />
            {data.config?.min_head_pressure != null ? (
              <ReferenceLine y={Number(data.config.min_head_pressure)} stroke="#f43f5e" strokeDasharray="4 4" name="Minimum Safe Pressure" />
            ) : null}
            {data.config?.max_head_pressure != null ? (
              <ReferenceLine y={Number(data.config.max_head_pressure)} stroke="#f59e0b" strokeDasharray="4 4" name="Maximum Safe Pressure" />
            ) : null}
            {rec != null && Number.isFinite(Number(rec)) ? (
              <ReferenceLine y={Number(rec)} stroke="#34d399" strokeDasharray="3 3" name="Optimized Target" />
            ) : null}
            <Line type="monotone" dataKey="head_pressure" name="Actual Condensing Pressure" stroke={CHART_COLORS.current} dot={false} />
          </LineChart>
        </EngineeringChart>
      )}
    </section>
  );
}
