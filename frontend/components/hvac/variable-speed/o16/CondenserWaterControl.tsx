'use client';

import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import type { O16Dashboard } from '@/lib/hvac/o16Types';
import { fmtDash, fmtUnit } from '@/lib/hvac/o16Format';

function statusFor(current: unknown, limitMin?: unknown, limitMax?: unknown): string {
  if (current == null || current === '') return '—';
  const v = Number(current);
  if (!Number.isFinite(v)) return '—';
  if (limitMin != null && Number.isFinite(Number(limitMin)) && v < Number(limitMin)) return 'LOW';
  if (limitMax != null && Number.isFinite(Number(limitMax)) && v > Number(limitMax)) return 'HIGH';
  return 'OK';
}

export function CondenserWaterControl({ data }: { data: O16Dashboard }) {
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const cfg = data.config || {};
  const rows: Array<[string, string, string, string, string]> = [
    ['Entering condenser water', fmtUnit(cs.cewt_c, '°C'), fmtUnit(cfg.target_condensing_temp_c, '°C'), '—', statusFor(cs.cewt_c)],
    ['Leaving condenser water', fmtUnit(cs.clwt_c, '°C'), '—', '—', statusFor(cs.clwt_c)],
    ['Water ΔT', fmtUnit(cs.cw_delta_t_c, '°C'), '—', '—', statusFor(cs.cw_delta_t_c)],
    ['Water flow', fmtDash(cs.cw_flow), fmtDash(os.recommended_cw_flow), fmtDash(cfg.min_cw_flow), statusFor(cs.cw_flow, cfg.min_cw_flow, cfg.max_cw_flow)],
    ['Pump speed', fmtUnit(cs.pump_speed_pct, '%'), fmtUnit(os.recommended_pump_speed_pct, '%'), fmtUnit(cfg.min_pump_speed_pct, '%'), statusFor(cs.pump_speed_pct, cfg.min_pump_speed_pct, cfg.max_pump_speed_pct)],
    ['Tower fan speed', '—', '—', '—', '—'],
    ['Approach temperature', fmtUnit(cs.approach_c, '°C'), '—', '—', statusFor(cs.approach_c)],
    ['Valve position', fmtUnit(cs.valve_position_pct, '%'), fmtUnit(os.recommended_valve_position_pct, '%'), '—', statusFor(cs.valve_position_pct)],
  ];
  return (
    <section className="kpi-tile space-y-2 col-span-12 lg:col-span-6" aria-labelledby="o16-cw">
      <h2 id="o16-cw" className="text-sm font-semibold text-slate-900">
        Condenser Water Control
      </h2>
      <EngineeringTable>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Current</th>
            <th>Target</th>
            <th>Limit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={`${r[0]}-${i}`} className="font-mono">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </EngineeringTable>
    </section>
  );
}
