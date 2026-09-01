'use client';

import { formatPercent } from '@/lib/hvac/formatters';
import { o10Enth, o10Num, o10Temp } from '@/lib/hvac/o10Format';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

function Col({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="border border-slate-200 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 py-1 text-xs font-mono">
          <span className="text-slate-500">{k}</span>
          <span className="text-slate-900">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function O10AirCondition({ data }: { data: VentilationOpportunity }) {
  const adv = o10Num(data, 'enthalpy_advantage_kj_kg');
  const delta = adv == null ? '—' : `${adv.toFixed(2)} kJ/kg`;
  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Air condition analysis">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Air condition analysis</h2>
      <p className="text-[11px] text-slate-500">Enthalpy / dew point — not RH alone. Difference is shown only when the backend computed it.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Col
          title="Outdoor"
          rows={[
            ['Temperature', o10Temp(data, 'outdoor_drybulb_c')],
            ['RH', formatPercent(o10Num(data, 'outdoor_rh_pct', 'outdoor_rh_percent'))],
            ['Dew point', o10Temp(data, 'outdoor_dew_point_c')],
            ['Enthalpy', o10Enth(data, 'outdoor_enthalpy_kj_kg')],
          ]}
        />
        <Col
          title="Return"
          rows={[
            ['Temperature', o10Temp(data, 'return_drybulb_c')],
            ['RH', formatPercent(o10Num(data, 'return_rh_pct', 'return_rh_percent'))],
            ['Dew point', o10Temp(data, 'return_dew_point_c')],
            ['Enthalpy', o10Enth(data, 'return_enthalpy_kj_kg')],
          ]}
        />
        <Col title="Difference" rows={[['Outdoor vs return enthalpy', delta]]} />
      </div>
    </section>
  );
}
