'use client';

import type { O16Dashboard, O16EquipmentRow } from '@/lib/hvac/o16Types';
import { fmtDash, fmtUnit } from '@/lib/hvac/o16Format';

function roleOf(row: O16EquipmentRow) {
  const blob = `${row.type || ''} ${row.name || ''}`.toUpperCase();
  if (blob.includes('TOWER')) return 'tower';
  if (blob.includes('PUMP')) return 'pump';
  if (blob.includes('CHILLER') || blob.includes('COMPRESSOR')) return 'chiller';
  if (blob.includes('VALVE')) return 'valve';
  if (blob.includes('CONDENSER')) return 'condenser';
  return 'other';
}

function Node({ title, id, value, live }: { title: string; id: string; value: string; live: boolean }) {
  return (
    <div className={`w-full max-w-[220px] border px-3 py-2 text-center ${live ? 'border-cyan-500/40 bg-white' : 'border-slate-200 bg-white'}`}>
      <div className="text-[10px] uppercase text-slate-500">{title}</div>
      <div className="font-mono text-xs text-cyan-800">{id}</div>
      <div className="font-mono text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

function Arrow({ live }: { live: boolean }) {
  return (
    <div className={`text-cyan-500/70 text-sm ${live ? 'animate-pulse' : ''}`} aria-hidden>
      ↓
    </div>
  );
}

export function CondenserPlantDiagram({ data, equipment }: { data: O16Dashboard; equipment: O16EquipmentRow[] }) {
  const cs = data.current_state || {};
  const live = Boolean(data.live) && !((data.ui_state || data.header?.ui_state || '').toUpperCase() === 'SIMULATION');
  const named = (role: string) => equipment.find((e) => roleOf(e) === role);
  const tower = named('tower');
  const pump = named('pump');
  const cond = named('condenser');
  const chiller = named('chiller');
  return (
    <section className="kpi-tile space-y-2 h-full" aria-labelledby="o16-plant">
      <h2 id="o16-plant" className="text-sm font-semibold text-slate-900">
        Water-cooled condenser plant
      </h2>
      <p className="text-[11px] text-slate-500">
        Equipment IDs come from the registry. Flow animation runs only when telemetry is classified LIVE.
      </p>
      <div className="flex flex-col items-center gap-1 py-2">
        <Node title="Cooling Tower" id={fmtDash(tower?.name || tower?.equipment_id)} value={fmtUnit(cs.outdoor_wet_bulb_c, '°C WB')} live={live} />
        <Arrow live={live} />
        <Node title="CW Pump" id={fmtDash(pump?.name || pump?.equipment_id)} value={fmtUnit(cs.pump_speed_pct, '%')} live={live} />
        <Arrow live={live} />
        <Node title="Condenser" id={fmtDash(cond?.name || cond?.equipment_id)} value={fmtDash(cs.head_pressure)} live={live} />
        <Arrow live={live} />
        <Node title="Refrigeration / Chiller" id={fmtDash(chiller?.name || chiller?.equipment_id)} value={fmtDash(cs.compressor_status)} live={live} />
        <Arrow live={live} />
        <Node title="Cooling Tower return" id={fmtDash(tower?.name || tower?.equipment_id)} value={fmtUnit(cs.clwt_c, '°C')} live={live} />
      </div>
    </section>
  );
}
