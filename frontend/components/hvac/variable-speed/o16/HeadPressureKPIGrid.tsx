'use client';

import type { O16Dashboard, O16HistoryPoint } from '@/lib/hvac/o16Types';
import { fmtDash, fmtUnit, isMissing, numericTrend } from '@/lib/hvac/o16Format';

function Card({
  label,
  current,
  unit,
  targetLabel,
  target,
  trend,
  quality,
  targetUnit,
}: {
  label: string;
  current: unknown;
  unit?: string;
  targetLabel: string;
  target: unknown;
  targetUnit?: string;
  trend: '↑' | '↓' | '—';
  quality?: string | null;
}) {
  return (
    <div className="kpi-tile">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">{label}</span>
        <span className="text-[10px] font-mono text-slate-500" title="Trend vs previous historian sample">
          {trend}
        </span>
      </div>
      <div className={`mt-2 text-lg font-bold font-mono tracking-tight ${isMissing(current) ? 'text-amber-300/90 text-sm' : 'text-slate-900'}`}>
        {isMissing(current) ? 'NO DATA' : unit ? fmtUnit(current, unit) : fmtDash(current)}
      </div>
      <div className="text-[11px] text-slate-500 mt-1 font-mono">
        {targetLabel} {isMissing(target) ? 'NO DATA' : (targetUnit || unit) ? fmtUnit(target, targetUnit || unit) : fmtDash(target)}
      </div>
      <div className="text-[10px] font-mono text-slate-600 mt-1 truncate">{quality || '—'}</div>
    </div>
  );
}

export function HeadPressureKPIGrid({ data, history }: { data: O16Dashboard; history: O16HistoryPoint[] }) {
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const q = data.classified_telemetry?.quality || data.classified_telemetry?.status;
  const prevHp = history.length >= 2 ? history[history.length - 2]?.head_pressure : null;
  const prevCw = history.length >= 2 ? history[history.length - 2]?.cw_supply : null;
  const prevFlow = history.length >= 2 ? history[history.length - 2]?.cw_flow : null;
  const energy =
    data.energy_impact_class === 'PREDICTED' && data.predicted_power_delta_kw != null ? data.predicted_power_delta_kw : null;
  const daily = data.savings?.predicted_kwh;
  const cewt = cs.cewt_c;
  return (
    <div className="col-span-12 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <Card
        label="Condenser Water Temperature"
        current={cewt}
        unit="°C"
        targetLabel="Target"
        target={data.config?.target_condensing_temp_c}
        trend={numericTrend(cewt, prevCw)}
        quality={q}
      />
      <Card
        label="Head Pressure"
        current={cs.head_pressure}
        targetLabel="Recommended"
        target={os.recommended_head_pressure}
        trend={numericTrend(cs.head_pressure, prevHp)}
        quality={q}
      />
      <Card
        label="Condenser Approach"
        current={cs.approach_c}
        unit="°C"
        targetLabel="Target"
        target={null}
        trend="—"
        quality={q}
      />
      <Card
        label="Condenser Water Flow"
        current={cs.cw_flow}
        targetLabel="Target"
        target={os.recommended_cw_flow}
        trend={numericTrend(cs.cw_flow, prevFlow)}
        quality={q}
      />
      <Card
        label="Estimated Energy Impact"
        current={energy}
        unit="kW"
        targetLabel="Daily"
        target={daily}
        targetUnit="kWh/day"
        trend="—"
        quality={energy == null ? q : 'PREDICTED'}
      />
    </div>
  );
}
