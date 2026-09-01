'use client';

import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o10Enth, o10Num, o10Str, o10Temp } from '@/lib/hvac/o10Format';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-xs font-mono border-b border-slate-200">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 text-right">{value}</span>
    </div>
  );
}

export function O10CurrentRecommended({ data }: { data: VentilationOpportunity }) {
  const recDamper = formatPercent(data.optimized?.damperPct);
  const hasRec = data.optimized?.damperPct != null || data.recommendation?.action;
  return (
    <section className="col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-3" aria-label="Current versus recommended">
      <div className="kpi-tile">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Current</h2>
        <Row label="Outdoor Air Temperature" value={o10Temp(data, 'outdoor_drybulb_c')} />
        <Row label="Outdoor Air Enthalpy" value={o10Enth(data, 'outdoor_enthalpy_kj_kg')} />
        <Row label="Outdoor Dew Point" value={o10Temp(data, 'outdoor_dew_point_c')} />
        <Row label="Return Air Temperature" value={o10Temp(data, 'return_drybulb_c')} />
        <Row label="Return Air Enthalpy" value={o10Enth(data, 'return_enthalpy_kj_kg')} />
        <Row label="Supply Air Temperature" value={o10Temp(data, 'supply_air_temp_c')} />
        <Row label="Mixed Air Temperature" value={o10Temp(data, 'mixed_air_temp_c')} />
        <Row label="OA Damper" value={formatPercent(data.current?.damperPct)} />
        <Row label="Return Damper" value={formatPercent(o10Num(data, 'return_damper_pct'))} />
        <Row label="Relief Damper" value={formatPercent(o10Num(data, 'relief_damper_pct'))} />
        <Row label="Cooling Valve" value={formatPercent(o10Num(data, 'cooling_valve_percent'))} />
        <Row label="Fan Status" value={o10Str(data, 'fan_status', 'fan_state')} />
      </div>
      <div className="kpi-tile">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Recommended</h2>
        {!hasRec ? (
          <p className="text-[11px] font-mono text-amber-300">NO DATA</p>
        ) : (
          <>
            <Row label="Economy Cycle State" value={o10Str(data, 'economizer_status')} />
            <Row label="Outdoor Air Damper" value={recDamper} />
            <Row label="Return Air Damper" value={formatPercent(o10Num(data, 'recommended_return_damper_pct'))} />
            <Row label="Relief Air Damper" value={formatPercent(o10Num(data, 'recommended_relief_damper_pct'))} />
            <Row label="Cooling Valve" value={formatPercent(o10Num(data, 'recommended_cooling_valve_pct'))} />
            <Row label="Supply Air Target" value={o10Temp(data, 'recommended_sat_c', 'supply_air_target_c')} />
            <Row label="Mechanical Cooling Stage" value={o10Str(data, 'mechanical_cooling_stage')} />
            <Row label="Action" value={formatDash(data.recommendation?.action)} />
          </>
        )}
      </div>
    </section>
  );
}
