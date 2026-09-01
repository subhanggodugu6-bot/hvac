'use client';

import React, { useMemo, useState } from 'react';
import { ShieldCheck, RotateCcw, Activity } from 'lucide-react';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { KPIGrid } from '@/components/hvac/KPIGrid';
import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
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
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { useO14Dashboard, useO14History, useO14Mutations } from '@/hooks/useO14';
import { ApiError } from '@/lib/api/client';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { actionErrorText } from '@/lib/hvac/actionError';

function na(v: unknown, fallback = 'Unavailable'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function fmtNum(v: unknown, digits = 1): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

export function O14KPIGrid({ items }: { items: any[] }) {
  return (
    <KPIGrid
      emptyText="Unavailable"
      items={(items || []).map((k) => ({
        label: k.label,
        value: k.value == null ? null : `${fmtNum(k.value)}${k.unit ? ` ${k.unit}` : ''}`,
        detail: k.timestamp ? String(k.timestamp) : undefined,
        status: k.status,
        quality: k.data_quality,
        source: k.source,
      }))}
    />
  );
}

export function O14SystemState({ current, pumps }: { current: any; pumps: any[] }) {
  return (
    <div className="kpi-tile space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Current system state</div>
      <div className="text-xs font-mono text-slate-400">Secondary CHW system → Pumps → Distribution → Loads / AHUs / FCUs</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {[
          ['Index DP', current?.index_dp, current?.dp_unit],
          ['DP setpoint', current?.dp_setpoint, current?.dp_unit],
          ['Flow', current?.flow, null],
          ['Speed', current?.pump_speed_pct, '%'],
          ['Power', current?.pump_power_kw, 'kW'],
          ['Most-open valve', current?.most_open_valve_pct, '%'],
          ['CHWST', current?.supply_temperature, '°C'],
          ['CHWRT', current?.return_temperature, '°C'],
          ['Load', current?.load_pct, '%'],
          ['Pumps running', current?.pumps_running, null],
          ['Cooling call', current?.cooling_call, null],
        ].map(([label, val, unit]) => (
          <div key={String(label)}>
            <div className="text-[10px] uppercase text-slate-500">{label}</div>
            <div className="font-mono text-slate-900 mt-0.5">{val == null ? 'Unavailable' : `${fmtNum(val)}${unit ? ` ${unit}` : ''}`}</div>
          </div>
        ))}
      </div>
      {pumps?.length ? (
        <div className="text-[11px] text-slate-500">{pumps.length} secondary CHW pump record(s) from equipment registry.</div>
      ) : (
        <div className="text-[11px] text-amber-300">No secondary CHW pump entities in the database.</div>
      )}
    </div>
  );
}

export function O14PumpGrid({ pumps }: { pumps: any[] }) {
  if (!pumps?.length) {
    return <EmptyState title="No pump entities" detail="Pump IDs are loaded from the equipment registry. None are hardcoded." />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {pumps.map((p) => (
        <div key={p.pump_id} className="kpi-tile">
          <div className="flex items-center justify-between">
            <div className="font-mono text-sm text-slate-900">{p.pump_id}</div>
            <StatusBadge tone={toneForStatus(p.data_quality)}>{na(p.status, 'Unknown')}</StatusBadge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono text-slate-700">
            <div>Speed: {p.speed == null ? 'Unavailable' : `${fmtNum(p.speed)} %`}</div>
            <div>Flow: {p.flow == null ? 'Unavailable' : fmtNum(p.flow)}</div>
            <div>Power: {p.power == null ? 'Unavailable' : `${fmtNum(p.power)} kW`}</div>
            <div>Fault: {p.fault == null ? 'Unavailable' : String(p.fault)}</div>
            <div>Quality: {na(p.data_quality)}</div>
            <div>Last seen: {na(p.last_seen)}</div>
          </div>
          <div className="text-[10px] text-slate-500 mt-2">Source {na(p.source)} · never shown as LIVE if SIMULATION</div>
        </div>
      ))}
    </div>
  );
}

export function O14OptimizationRecommendation({ data }: { data: any }) {
  const why = data?.why || {};
  return (
    <div className="kpi-tile space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Optimization recommendation</h3>
        <StatusBadge tone={toneForStatus(data?.recommendation_state)}>{na(data?.recommendation_state)}</StatusBadge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase text-slate-500">Current</div>
          <div className="font-mono text-slate-900">{data?.current_value == null ? 'Unavailable' : `${fmtNum(data.current_value)} ${data.unit || ''}`}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Recommended</div>
          <div className="font-mono text-cyan-800">{data?.optimized_value == null ? 'Unavailable' : `${fmtNum(data.optimized_value)} ${data.unit || ''}`}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Expected effect</div>
          <div className="font-mono text-slate-800 text-xs">
            {data?.energy_impact_class === 'PREDICTED' && data?.predicted_power_delta_kw != null
              ? `Predicted ${fmtNum(data.predicted_power_delta_kw)} kW (affinity, not verified)`
              : 'No verified savings'}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-700 leading-relaxed">{data?.reason || 'AWAITING TELEMETRY'}</p>
      <div className="flex flex-wrap gap-2 text-[11px] font-mono">
        <StatusBadge tone={toneForStatus(String(data?.confidence))}>Confidence {data?.confidence == null ? 'Unavailable' : `${Math.round(Number(data.confidence) * 100)}%`}</StatusBadge>
        <StatusBadge tone={toneForStatus(data?.safety_status)}>Safety {na(data?.safety_status)}</StatusBadge>
        <StatusBadge tone={toneForStatus((data?.classified_telemetry || {}).status)}>Data {(data?.classified_telemetry || {}).status || 'MISSING'}</StatusBadge>
      </div>
      <div>
        <div className="text-[11px] uppercase text-slate-500 mb-1">Why this recommendation?</div>
        <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
          <li>Current operating condition: {na(why.current_operating_condition)}</li>
          <li>Detected demand: {na(why.detected_demand)}</li>
          <li>Control relationship: {na(why.control_relationship)}</li>
          <li>Safety gates: {Array.isArray(why.safety_gates) ? why.safety_gates.join('; ') : 'Unavailable'}</li>
          <li>{na(why.reason_for_change)}</li>
        </ul>
      </div>
      {data?.guide_potential_note && <div className="text-[10px] text-slate-500">{data.guide_potential_note}</div>}
    </div>
  );
}

export function O14SafetyPanel({ safety }: { safety: any }) {
  const checks = safety?.checks || [];
  return (
    <div className="kpi-tile">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-slate-900">Safety validation</h3>
        <span className="text-[10px] text-slate-500">Backend SafetyEngine is authoritative</span>
      </div>
      <div className="space-y-1.5">
        {checks.length ? (
          checks.map((c: any) => (
            <div key={c.check_name} className="flex justify-between text-xs font-mono border-b border-slate-200 py-1">
              <span className="text-slate-400">{c.check_name}</span>
              <span className={c.result === 'PASS' ? 'text-emerald-400' : 'text-amber-300'}>{c.result} · {c.reason}</span>
            </div>
          ))
        ) : (
          <EmptyState title="No safety evaluation" detail="Safety gates appear after telemetry is evaluated." />
        )}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{na(safety?.overall, 'HOLD — SAFETY CONDITION NOT MET')}</div>
    </div>
  );
}

export function O14TrendCharts({ points }: { points: any[] }) {
  if (!points?.length) {
    return <EmptyState title="No historical series" detail="Charts use persisted O14 snapshots only. Nothing is fabricated." />;
  }
  const series = [
    ['dp', 'dp_setpoint', 'Differential pressure vs setpoint'],
    ['speed', null, 'Pump speed'],
    ['flow', null, 'CHW flow'],
    ['power', null, 'Pump power'],
    ['load', null, 'System load'],
    ['valve_position', null, 'Valve position'],
  ] as const;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {series.map(([a, b, title]) => (
        <div key={title} className="kpi-tile">
          <div className="text-[11px] uppercase text-slate-500 mb-2">{title}</div>
          <EngineeringChart height={200}>
            <LineChart data={points}>
              <CartesianGrid stroke={CHART_COLORS.grid} />
              <XAxis dataKey="timestamp" hide />
              <YAxis stroke={CHART_COLORS.axis} />
              <Tooltip content={<EngineeringTooltip />} />
              <Legend />
              <Line type="monotone" dataKey={a} name={a} stroke={CHART_COLORS.current} dot={false} />
              {b ? <Line type="monotone" dataKey={b} name={String(b)} stroke={CHART_COLORS.optimized} dot={false} /> : null}
            </LineChart>
          </EngineeringChart>
        </div>
      ))}
    </div>
  );
}

export function O14CommandPanel({ data, onError }: { data: any; onError: (m: string) => void }) {
  const mut = useO14Mutations();
  const [open, setOpen] = useState(false);
  const cmd = (data?.commands || [])[0] || data?.command;
  const mode = data?.control_mode || data?.config?.control_mode;
  const os = data?.optimized_state || {};
  const cs = data?.current_state || {};

  const apply = async () => {
    try {
      if (!cmd?.command_id) await mut.optimize.mutateAsync();
      const id = cmd?.command_id;
      if (id) await mut.apply.mutateAsync({ id, confirm: true });
      setOpen(false);
    } catch (e) {
      onError(actionErrorText(e, 'Apply blocked'));
      setOpen(false);
    }
  };

  return (
    <div className="kpi-tile space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Control panel</h3>
      <div className="text-xs font-mono text-slate-400">Mode {na(mode)} · SAFE_MODE {data?.safe_mode ? 'ON' : 'OFF'}</div>
      <div className="text-xs text-slate-700">
        Current {cs?.dp_setpoint == null ? 'Unavailable' : fmtNum(cs.dp_setpoint)} → Proposed {os?.recommended_dp_setpoint == null ? 'Unavailable' : fmtNum(os.recommended_dp_setpoint)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => mut.optimize.mutate()} disabled={mut.optimize.isPending}>
          Optimize
        </button>
        <button className="btn-primary opacity-40" disabled title="WRITE_DISABLED — read-only commissioning mode.">
          Apply
        </button>
        <button
          className="px-3 py-1.5 rounded border border-slate-200 text-xs opacity-40"
          disabled
          title="WRITE_DISABLED — read-only commissioning mode."
        >
          Verify
        </button>
        <button
          className="px-3 py-1.5 rounded border border-slate-200 text-xs opacity-40"
          disabled
          title="WRITE_DISABLED — read-only commissioning mode."
        >
          Rollback
        </button>
        <button className="btn-danger" onClick={() => mut.safeMode.mutate('O14 operator')}>
          Enter SAFE MODE
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">Confirm SCHW write</h4>
            <div className="text-xs font-mono text-slate-700 space-y-1">
              <div>Point: {na(cmd?.point_id)}</div>
              <div>Current: {na(cmd?.old_value)}</div>
              <div>Proposed: {na(cmd?.new_value)}</div>
              <div>Difference: {cmd?.old_value != null && cmd?.new_value != null ? fmtNum(Number(cmd.new_value) - Number(cmd.old_value)) : 'Unavailable'}</div>
              <div>Reason: {na(cmd?.reason || data?.reason)}</div>
              <div>Expected: lower index DP while most-open valve approaches 95% (guide).</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 border border-slate-200 text-xs" onClick={() => setOpen(false)}>
                CANCEL
              </button>
              <button className="btn-primary opacity-40" disabled title="WRITE_DISABLED — read-only commissioning mode.">
                APPLY
              </button>
              <button className="btn-danger" onClick={() => mut.safeMode.mutate('pre-apply')}>
                ENTER SAFE MODE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function O14CommandHistory({ commands }: { commands: any[] }) {
  if (!commands?.length) return <EmptyState title="No commands" detail="Command rows are persisted control_commands for O14 only." />;
  return (
    <div className="overflow-x-auto kpi-tile">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-slate-500 text-left">
            <th className="py-1">command_id</th>
            <th>status</th>
            <th>old</th>
            <th>new</th>
            <th>created</th>
          </tr>
        </thead>
        <tbody>
          {commands.map((c) => (
            <tr key={c.command_id} className="border-t border-slate-200 text-slate-800">
              <td className="py-1.5">{c.command_id}</td>
              <td>{c.status}</td>
              <td>{c.old_value == null ? 'Unavailable' : c.old_value}</td>
              <td>{c.new_value == null ? 'Unavailable' : c.new_value}</td>
              <td>{c.created_at || 'Unavailable'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function O14VerificationStatus({ commands }: { commands: any[] }) {
  const c = commands?.[0];
  return (
    <div className="kpi-tile text-xs">
      <div className="text-[11px] uppercase text-slate-500 mb-1">Verification</div>
      <div className="font-mono text-slate-800">Status {na(c?.status)}</div>
      <div className="text-slate-500">Applied {na(c?.applied_at)} · Verified {na(c?.verified_at)} · Rollback {na(c?.rollback_at)}</div>
    </div>
  );
}

export function O14AuditTimeline({ events }: { events: any[] }) {
  if (!events?.length) return <EmptyState title="No audit events" detail="Audit rows persist after optimize / apply / verify / rollback." />;
  return (
    <ol className="space-y-2">
      {events.slice(0, 20).map((e, i) => (
        <li key={i} className="text-xs font-mono text-slate-700 border-l border-cyan-500/30 pl-3">
          {na(e.timestamp)} · {na(e.action)} · {na(e.result)}
        </li>
      ))}
    </ol>
  );
}

export function O14Dashboard() {
  const def = getOpportunity('O14')!;
  const dash = useO14Dashboard();
  const [hours, setHours] = useState(24);
  const hist = useO14History(hours);
  const [err, setErr] = useState<string | null>(null);
  const data = dash.data as any;
  const header = data?.header || {};
  const ui = header.ui_state || data?.ui_state;

  const liveBadge = useMemo(
    () => provenanceFromAgent(data as Record<string, unknown> | null),
    [data]
  );

  return (
    <OpportunityWorkspace
      className="space-y-6 max-w-7xl mx-auto pb-16"
      def={def}
      live={liveBadge}
      model={header.control_mode}
      bms={data?.bms_connected || header.bms === 'CONNECTED' || header.bms === 'LIVE' ? 'CONNECTED' : 'OFFLINE'}
      actions={
        <button className="px-3 py-1.5 rounded border border-slate-200 text-xs font-mono text-slate-700" title="SAFE MODE">
          SAFE MODE {header.safe_mode ? 'ON' : 'VISIBLE'}
        </button>
      }
    >
      <div className="flex flex-wrap gap-2 text-[11px] font-mono">
        <StatusBadge tone={toneForStatus(header.bms)}>{header.bms === 'LIVE' || header.bms === 'CONNECTED' ? 'BMS CONNECTED' : 'BMS OFFLINE'}</StatusBadge>
        <StatusBadge tone={toneForStatus(liveBadge)}>{liveBadge}</StatusBadge>
        <StatusBadge tone="neutral">MODE {na(header.control_mode)}</StatusBadge>
        <StatusBadge tone={toneForStatus(header.safety)}>SAFETY {na(header.safety)}</StatusBadge>
        <StatusBadge tone={toneForStatus(header.optimization)}>{na(header.optimization)}</StatusBadge>
        <StatusBadge tone="muted">Last telemetry {na(header.last_telemetry)}</StatusBadge>
        <StatusBadge tone="muted">Last optimization {na(header.last_optimization)}</StatusBadge>
        <StatusBadge tone={header.safe_mode ? 'warn' : 'live'}>SAFE MODE {header.safe_mode ? 'ON' : 'OFF'}</StatusBadge>
      </div>

      {dash.isFetching && !data ? <p className="text-[11px] font-mono text-slate-500">Loading O14 telemetry…</p> : null}
      {dash.isError && (
        <EmptyState title="ERROR" detail={dash.error instanceof ApiError ? dash.error.message : 'DATA SOURCE ERROR'} />
      )}
      {err && <EmptyState title="COMMAND REJECTED" detail={err} />}
      {ui === 'NO_DATA' && !dash.isLoading && (
        <EmptyState title="NO DATA" detail="Canonical SCHW telemetry is missing. Simulator values are never labeled LIVE." />
      )}
      {ui === 'SIMULATION' && <EmptyState title="SIMULATION" detail="This stream is simulation/demo and is not production LIVE." />}

          <O14KPIGrid items={data?.kpis || []} />
          <O14SystemState current={data?.current_state} pumps={data?.pumps || []} />
          <O14OptimizationRecommendation data={data || {}} />
          <div className="flex items-center gap-2 text-xs">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            History
            {[1, 6, 24, 168, 720].map((h) => (
              <button
                key={h}
                className={`px-2 py-1 border text-[11px] ${hours === h ? 'border-cyan-400 text-cyan-800' : 'border-slate-200 text-slate-400'}`}
                onClick={() => setHours(h)}
              >
                {h === 168 ? '7d' : h === 720 ? '30d' : `${h}h`}
              </button>
            ))}
          </div>
          <O14TrendCharts points={hist.data?.points || []} />
          <O14PumpGrid pumps={data?.pumps || []} />
          <O14SafetyPanel safety={data?.safety} />
          <O14CommandPanel data={data || {}} onError={setErr} />
          <O14VerificationStatus commands={data?.commands || []} />
          <O14CommandHistory commands={data?.commands || []} />
    </OpportunityWorkspace>
  );
}

export { RotateCcw };
