'use client';

import { useMemo, useState } from 'react';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import { fmtDash, fmtUnit } from '@/lib/hvac/o15Format';

function row(label: string, value: string, status?: string | null) {
  return (
    <tr key={label}>
      <td className="text-slate-500">{label}</td>
      <td className="font-mono text-slate-900">{value}</td>
      <td className="font-mono text-slate-400">{status || '—'}</td>
    </tr>
  );
}

export function O15OperatingState({ data }: { data: O15Dashboard }) {
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const units = useMemo(() => data.condensers || [], [data.condensers]);
  const ids = useMemo(
    () => units.map((u, i) => String(u.equipment_id || u.name || i)),
    [units]
  );
  const [selectedId, setSelectedId] = useState<string>(ids[0] || '');
  const eq = units.find((u, i) => String(u.equipment_id || u.name || i) === selectedId) || units[0];
  const q = data.classified_telemetry?.quality || data.classified_telemetry?.status;
  const src = data.classified_telemetry?.source;
  const ui = data.ui_state || data.header?.ui_state;
  return (
    <section className="kpi-tile space-y-2 col-span-12" aria-labelledby="o15-state">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 id="o15-state" className="text-sm font-semibold text-slate-900">
          Air-Cooled Condenser Operating State
        </h2>
        {units.length > 1 ? (
          <label className="text-[11px] font-mono text-slate-500">
            Condenser
            <select
              className="ml-2 bg-white border border-slate-200 text-slate-800 px-2 py-1 focus-visible:ring-2 focus-visible:ring-cyan-400"
              aria-label="Condenser equipment"
              value={selectedId || ids[0] || ''}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {units.map((u, i) => {
                const id = String(u.equipment_id || u.name || i);
                return (
                  <option key={id} value={id}>
                    {u.name || u.equipment_id || id}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}
      </div>
      <EngineeringTable>
        <thead>
          <tr>
            <th>Label</th>
            <th>Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {row('Equipment ID', fmtDash(eq?.equipment_id || eq?.name))}
          {row('System ID', fmtDash(eq?.equipment_id || data.config?.building_id))}
          {row('Building', fmtDash(data.config?.building_id))}
          {row('Condenser Status', fmtDash(eq?.status ?? cs.fan_status), q)}
          {row('Compressor Status', fmtDash(cs.compressor_status))}
          {row('Compressor Loading', fmtUnit(cs.compressor_power_kw, 'kW'))}
          {row('Current Head Pressure', fmtDash(cs.head_pressure))}
          {row('Head Pressure Target', fmtDash(cs.head_pressure_setpoint))}
          {row('Recommended Target', fmtDash(os.recommended_head_pressure))}
          {row('Entering Condenser Air (OAT)', fmtUnit(cs.outdoor_temperature_c, '°C'))}
          {row('Leaving Condenser Air Temperature', fmtUnit(cs.condenser_temperature_c, '°C'))}
          {row('Condenser Approach', fmtUnit(cs.observed_approach_c, '°C'))}
          {row('Fan Speed', fmtUnit(cs.fan_speed_pct, '%'))}
          {row('Fan Command', fmtDash(eq?.command ?? cs.fan_status))}
          {row('Fan Feedback', fmtDash(eq?.speed ?? data.fans?.[0]?.speed))}
          {row('Fan Power', fmtUnit(cs.fan_power_kw, 'kW'))}
          {row('Active Condenser Fans', fmtDash(cs.fans_running))}
          {row('Cooling Load', fmtDash(cs.load))}
          {row('Telemetry Quality', fmtDash(q))}
          {row('Telemetry Source', fmtDash(src), ui === 'SIMULATION' ? 'SIMULATION' : undefined)}
          {row('Last Telemetry', fmtDash(data.header?.last_telemetry || data.evaluated_at))}
        </tbody>
      </EngineeringTable>
    </section>
  );
}
