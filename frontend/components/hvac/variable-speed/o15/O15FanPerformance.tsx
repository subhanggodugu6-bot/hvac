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
  CHART_COLORS,
  EngineeringTooltip,
} from '@/components/hvac/EngineeringChart';
import type { O15Dashboard, O15HistoryPoint } from '@/lib/hvac/o15Types';
import { fmtDash, fmtUnit } from '@/lib/hvac/o15Format';

export function O15FanPerformance({ data, points }: { data: O15Dashboard; points: O15HistoryPoint[] }) {
  const cs = data.current_state || {};
  const fans = data.fans || [];
  return (
    <section className="kpi-tile space-y-3" aria-labelledby="o15-fan">
      <h2 id="o15-fan" className="text-sm font-semibold text-slate-900">
        Condenser Fan Performance
      </h2>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div>Fan Speed {fmtUnit(cs.fan_speed_pct, '%')}</div>
        <div>Fan Power {fmtUnit(cs.fan_power_kw, 'kW')}</div>
        <div>Active Fans {fmtDash(cs.fans_running)}</div>
        <div>Fan Command {fmtDash(cs.fan_status ?? fans[0]?.command)}</div>
        <div>Fan Feedback {fmtDash(fans[0]?.speed)}</div>
      </div>
      {!points.some((p) => p.fan_power != null || p.fan_speed != null) ? (
        <EmptyState title="No telemetry available" detail="Fan power history is empty." />
      ) : (
        <EngineeringChart height={180}>
          <LineChart data={points}>
            <CartesianGrid stroke={CHART_COLORS.grid} />
            <XAxis dataKey="timestamp" hide />
            <YAxis stroke={CHART_COLORS.axis} />
            <Tooltip content={<EngineeringTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="fan_power" name="Fan Power" stroke={CHART_COLORS.current} dot={false} />
            {points.some((p) => p.fan_speed != null) ? (
              <Line type="monotone" dataKey="fan_speed" name="Fan Speed" stroke={CHART_COLORS.optimized} dot={false} />
            ) : null}
          </LineChart>
        </EngineeringChart>
      )}
    </section>
  );
}
