'use client';

import type { O16Dashboard } from '@/lib/hvac/o16Types';
import { fmtDash, fmtUnit } from '@/lib/hvac/o16Format';

export function HeatRejectionConditions({ data }: { data: O16Dashboard }) {
  const cs = data.current_state || {};
  return (
    <section className="kpi-tile space-y-3 col-span-12 lg:col-span-6" aria-labelledby="o16-heat">
      <h2 id="o16-heat" className="text-sm font-semibold text-slate-900">
        Heat Rejection Conditions
      </h2>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div>Outdoor wet-bulb {fmtUnit(cs.outdoor_wet_bulb_c, '°C')}</div>
        <div>Outdoor dry-bulb {fmtUnit(cs.outdoor_temperature_c, '°C')}</div>
        <div>Cooling tower approach {fmtUnit(cs.approach_c, '°C')}</div>
        <div>CW pump speed {fmtUnit(cs.pump_speed_pct, '%')}</div>
        <div>Condenser water supply {fmtUnit(cs.cewt_c, '°C')}</div>
        <div>Condenser water return {fmtUnit(cs.clwt_c, '°C')}</div>
        <div>Plant load {fmtUnit(cs.load_pct, '%')}</div>
      </div>
      <div className="text-[11px] font-mono text-slate-600 leading-6 border border-slate-200 px-3 py-2">
        Outdoor conditions
        <div className="text-cyan-500/70">↓</div>
        Cooling tower
        <div className="text-cyan-500/70">↓</div>
        Condenser water temperature {fmtDash(cs.cewt_c)}
        <div className="text-cyan-500/70">↓</div>
        Condensing pressure {fmtDash(cs.head_pressure)}
        <div className="text-cyan-500/70">↓</div>
        Compressor / pump energy {fmtDash(cs.pump_power_kw)}
      </div>
    </section>
  );
}
