'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { formatAgeSeconds, formatCfm, formatDash, formatKw, formatPpm } from '@/lib/hvac/formatters';
import { O10_GUIDE, o10Num, o10Provenance, o10Str, o10VisualMode } from '@/lib/hvac/o10Format';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

const LOCKOUTS = [
  ['Fire Mode', 'fire_mode'],
  ['Unsafe Outdoor-Air Conditions', 'unsafe_oa'],
  ['High Temperature', 'high_temperature'],
  ['High Humidity / Dew Point', 'high_humidity'],
  ['Bad Sensor Quality', 'quality'],
  ['Stale Telemetry', 'stale'],
  ['BMS Offline', 'bms'],
  ['SAFE MODE', 'safe_mode'],
  ['Missing Required Sensors', 'missing_sensors'],
  ['Equipment Fault', 'equipment_fault'],
  ['Damper Fault', 'damper_fault'],
  ['Pressurization Issue', 'pressurization'],
] as const;

const EQUIPMENT = [
  'Outdoor Air Temperature Sensor',
  'Outdoor Air Humidity Sensor',
  'Return Air Temperature Sensor',
  'Return Air Humidity Sensor',
  'DDC Controller',
  'Economy Cycle Software',
  'Outdoor Air Damper',
  'Relief Air Damper',
  'Motorized Modulating Actuators',
  'Outdoor Air Duct',
  'Exhaust / Relief Duct',
  'Mixed Air Temperature Sensor',
];

const DIAGNOSTICS = [
  'Humidity Sensor',
  'Temperature Sensor',
  'Enthalpy Calculation',
  'OA Damper',
  'Return Damper',
  'Relief Damper',
  'Actuator',
  'Fan',
  'Pressurization',
  'Filter Condition',
  'BMS Communication',
];

function lockoutValue(data: VentilationOpportunity, key: string, safeMode?: boolean, prov?: string): string {
  if (key === 'fire_mode') return o10Str(data, 'fire_mode', 'fire_alarm');
  if (key === 'quality') return formatDash(data.telemetry?.quality);
  if (key === 'stale') return prov === 'STALE' ? 'ACTIVE' : 'CLEAR';
  if (key === 'bms') return data.bmsConnected ? 'CLEAR' : 'ACTIVE';
  if (key === 'safe_mode') return safeMode ? 'ACTIVE' : 'CLEAR';
  if (key === 'missing_sensors') return o10Num(data, 'outdoor_drybulb_c') == null ? 'ACTIVE' : 'CLEAR';
  return o10Str(data, key);
}

export function O10Modes({ data }: { data: VentilationOpportunity }) {
  const vis = o10VisualMode(data);
  return (
    <section className="col-span-12 kpi-tile space-y-2" aria-label="Economy cycle modes">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Economy cycle modes</h2>
      <div className="flex flex-wrap gap-1">
        {['OFF', 'MINIMUM OUTDOOR AIR', 'ECONOMY ENABLED', 'ECONOMY ACTIVE', 'ECONOMY + MECHANICAL COOLING', 'LOCKED OUT'].map((m) => (
          <StatusBadge key={m} tone={vis === m ? toneForStatus(m) : 'muted'} pulse={vis === m}>
            {m}
          </StatusBadge>
        ))}
      </div>
      <p className="text-xs text-slate-400">{formatDash(data.recommendation?.rationale)}</p>
    </section>
  );
}

export function O10Lockouts({ data, safeMode }: { data: VentilationOpportunity; safeMode?: boolean }) {
  const prov = o10Provenance(data);
  return (
    <section className="col-span-12 xl:col-span-6 kpi-tile space-y-2" aria-label="Lockouts">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Economy cycle lockouts</h2>
      <p className="text-[11px] text-slate-500">Fire mode must disable economy cycle. Faults are claimed only when telemetry supports them.</p>
      <ul className="space-y-1">
        {LOCKOUTS.map(([label, key]) => (
          <li key={key} className="flex justify-between gap-2 text-[11px] font-mono">
            <span className="text-slate-500">{label}</span>
            <StatusBadge tone={toneForStatus(lockoutValue(data, key, safeMode, prov))}>{lockoutValue(data, key, safeMode, prov)}</StatusBadge>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function O10ControlParams({ data }: { data: VentilationOpportunity }) {
  const rows: Array<[string, string]> = [
    ['Cooling Call Required', o10Str(data, 'cooling_call_required')],
    ['Outdoor Temperature Limit', o10Str(data, 'outdoor_temp_limit')],
    ['Outdoor Dew Point Limit', o10Str(data, 'dew_point_limit_c')],
    ['Outdoor Enthalpy Limit', o10Str(data, 'enthalpy_limit_kjkg')],
    ['Return-Air Enthalpy Margin', o10Str(data, 'return_enthalpy_margin_kjkg')],
    ['Minimum Outdoor Air', o10Str(data, 'min_oa_damper_pct')],
    ['Maximum Outdoor Air', o10Str(data, 'max_oa_damper_pct')],
    ['Supply Air Target', o10Str(data, 'supply_air_target_c')],
    ['Mixed Air Limit', o10Str(data, 'mixed_air_limit_c')],
    ['Economy Enable Schedule', o10Str(data, 'economy_schedule')],
    ['Lockout Conditions', o10Str(data, 'lockout_config')],
  ];
  return (
    <section className="col-span-12 xl:col-span-6 kpi-tile space-y-2" aria-label="Control parameters">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Control parameters</h2>
      <p className="text-[11px] text-slate-500">Values come from backend configuration. Editing is not enabled in this UI.</p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 text-[11px] font-mono border-b border-slate-200 py-1">
          <span className="text-slate-500">{k}</span>
          <span className="text-slate-800">{v}</span>
        </div>
      ))}
    </section>
  );
}

export function O10Energy({ data }: { data: VentilationOpportunity }) {
  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Energy impact">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Energy impact</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {[
          ['Compressor Energy', formatKw(o10Num(data, 'chiller_power_kw'))],
          ['Fan Energy', formatKw(data.energy?.currentKw)],
          ['Cooling Load', formatKw(o10Num(data, 'free_cooling_kw'))],
          ['Estimated Impact', formatKw(data.energy?.instantaneousKw ?? data.energy?.savingKw)],
          ['Measured Impact', 'NO DATA AVAILABLE'],
          ['Verified Impact', 'NO DATA AVAILABLE'],
        ].map(([k, v]) => (
          <article key={k} className="border border-slate-200 px-3 py-2">
            <div className="text-[10px] uppercase text-slate-500">{k}</div>
            <div className="text-sm font-mono text-slate-900 mt-1">{v}</div>
          </article>
        ))}
      </div>
      <div className="border border-cyan-500/20 px-3 py-2">
        <div className="text-[10px] uppercase text-cyan-800">Guide reported potential</div>
        <p className="text-sm text-slate-800 mt-1">{O10_GUIDE.compressorPotential}</p>
        <p className="text-[11px] text-slate-500 mt-1">Not actual site performance. Measured site impact is shown only when the backend computes and verifies it.</p>
      </div>
    </section>
  );
}

export function O10Iaq({ data }: { data: VentilationOpportunity }) {
  return (
    <section className="col-span-12 xl:col-span-6 kpi-tile space-y-2" aria-label="IAQ">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Indoor air quality considerations</h2>
      <p className="text-[11px] text-slate-500">Increased outdoor air during economy operation can provide an IAQ benefit according to the guide. Measurements are not invented.</p>
      <div className="text-xs font-mono space-y-1">
        <div className="flex justify-between"><span className="text-slate-500">Outdoor airflow</span><span>{formatCfm(data.current?.airflowCfm)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">CO2</span><span>{formatPpm(data.current?.co2Ppm)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">CO</span><span>{formatPpm(data.current?.coPpm)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">IAQ status</span><span>{o10Str(data, 'iaq_status', 'iaq_compliance')}</span></div>
      </div>
    </section>
  );
}

export function O10Equipment() {
  return (
    <section className="col-span-12 xl:col-span-6 kpi-tile space-y-2" aria-label="Equipment">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Economy cycle equipment</h2>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-1">
        {EQUIPMENT.map((name) => (
          <li key={name} className="flex justify-between gap-2 text-[11px] font-mono">
            <span className="text-slate-400">{name}</span>
            <StatusBadge tone="muted">UNKNOWN</StatusBadge>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-500">Asset status is UNKNOWN until the backend returns equipment records.</p>
    </section>
  );
}

export function O10Diagnostics() {
  return (
    <section className="col-span-12 kpi-tile space-y-2" aria-label="Diagnostics">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Economy cycle health</h2>
      <p className="text-[11px] text-slate-500">Guide diagnostic categories. Faults are not claimed without backend evidence.</p>
      <div className="flex flex-wrap gap-1">
        {DIAGNOSTICS.map((d) => (
          <StatusBadge key={d} tone="muted">
            {d} · UNKNOWN
          </StatusBadge>
        ))}
      </div>
    </section>
  );
}

export function O10Historian() {
  return (
    <section className="col-span-12 kpi-tile space-y-2" aria-label="Historian">
      <div className="flex justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Historian</h2>
        <div className="flex gap-1">{['24H', '7D', '30D', '90D'].map((r) => (
          <span key={r} className="px-2 py-0.5 text-[10px] font-mono border border-slate-200 text-slate-500">{r}</span>
        ))}</div>
      </div>
      <EmptyState title="NO HISTORIAN DATA AVAILABLE" detail="Time-series outdoor/return temperature, enthalpy, OA damper, and compressor power are not on GET /api/hvac/ventilation/O10." />
    </section>
  );
}

export function O10Audit({ events }: { events: Array<Record<string, unknown>> }) {
  return (
    <section className="col-span-12 kpi-tile space-y-2" aria-label="Control history">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Control history</h2>
      {events.length === 0 ? (
        <EmptyState title="NO AUDIT DATA AVAILABLE" detail="No persisted O10 audit rows were returned." />
      ) : (
        <EngineeringTable>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Opportunity</th>
              <th>Action</th>
              <th>Decision</th>
              <th>Result</th>
              <th>Safety</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td className="font-mono">{formatDash(e.timestamp)}</td>
                <td className="font-mono">{formatDash(e.opportunity_id || 'O10')}</td>
                <td className="font-mono">{formatDash(e.action)}</td>
                <td className="font-mono">{formatDash(e.decision)}</td>
                <td className="font-mono">{formatDash(e.result || e.approval_status)}</td>
                <td className="font-mono">{formatDash(e.safety_status)}</td>
                <td>{formatDash(e.reason)}</td>
              </tr>
            ))}
          </tbody>
        </EngineeringTable>
      )}
    </section>
  );
}

export function O10DataQuality({ data }: { data: VentilationOpportunity }) {
  const required = ['outdoor_drybulb_c', 'return_drybulb_c', 'outdoor_enthalpy_kj_kg', 'return_enthalpy_kj_kg'];
  const present = required.filter((k) => o10Num(data, k) != null).length;
  const prov = o10Provenance(data);
  return (
    <section className="col-span-12 xl:col-span-6 kpi-tile space-y-2" aria-label="Data quality">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Data quality</h2>
      <dl className="grid grid-cols-2 gap-2 text-[12px] font-mono">
        <div>
          <dt className="text-slate-500">Source</dt>
          <dd>{formatDash(data.telemetry?.source || data.source)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Quality</dt>
          <dd>{formatDash(data.telemetry?.quality)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Telemetry Age</dt>
          <dd>{formatAgeSeconds(data.telemetry?.ageSeconds)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">BMS</dt>
          <dd>{prov === 'LIVE' && data.bmsConnected ? 'CONNECTED' : 'OFFLINE'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Required Inputs</dt>
          <dd>{`${present} / ${required.length}`}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Classified</dt>
          <dd>{prov}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Last Update</dt>
          <dd>{formatDash(data.telemetry?.lastUpdated)}</dd>
        </div>
      </dl>
      {prov === 'SIMULATED' ? <p className="text-[11px] font-semibold text-amber-300">SIMULATED — never LIVE.</p> : null}
    </section>
  );
}

export function O10GuideReference() {
  return (
    <section className="col-span-12 xl:col-span-6 kpi-tile space-y-2" aria-label="Guide reference">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Guide reference</h2>
      <p className="text-[11px] text-cyan-800 font-mono">{O10_GUIDE.source}</p>
      <p className="text-sm text-slate-700">Outdoor air can be used directly for space cooling when conditions are favorable.</p>
      <ul className="text-[12px] font-mono text-slate-400 space-y-1">
        <li>Temperature {O10_GUIDE.outdoorTempC}</li>
        <li>Enthalpy {O10_GUIDE.outdoorEnthalpyKjkg}</li>
        <li>Dew point {O10_GUIDE.dewPointC}</li>
        <li>Optimized: OAT below zone cooling SP and return air, AND dew point &lt;12°C OR outdoor enthalpy {O10_GUIDE.enthalpyMarginKjkg}</li>
      </ul>
      <p className="text-[11px] text-slate-500">These values are guide reference, not measured plant limits unless configuration says so.</p>
    </section>
  );
}
