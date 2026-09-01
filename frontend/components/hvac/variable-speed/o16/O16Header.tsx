'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O16Dashboard, O16EquipmentRow } from '@/lib/hvac/o16Types';
import { bmsBadge, fmtDash, freshnessBadge, isSimulation, secondsAgo, telemetryBadge } from '@/lib/hvac/o16Format';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';

export function O16Header({
  data,
  equipment,
  selectedId,
  onSelect,
}: {
  data?: O16Dashboard | null;
  equipment: O16EquipmentRow[];
  selectedId: string | 'all';
  onSelect: (id: string | 'all') => void;
}) {
  const def = getOpportunity('O16')!;
  const sim = data ? isSimulation(data) : false;
  const bms = data ? bmsBadge(data) : 'OFFLINE';
  const tel = data ? telemetryBadge(data) : 'NO DATA';
  const fresh = data ? freshnessBadge(data) : 'NO DATA';
  const mode = data
    ? (data.header?.control_mode || data.config?.control_mode || 'ADVISORY').toUpperCase()
    : 'NO DATA';
  const safetyRaw = (data?.header?.safety || data?.safety_status || '').toUpperCase();
  const safety = safetyRaw || 'NO DATA';
  const building = data?.config?.building_id;
  return (
    <header className="px-5 pt-5 pb-4 space-y-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-cyan-400/80 mb-1.5">O16</div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{def.title}</h1>
          <p className="text-[13px] text-slate-400 mt-1.5 max-w-3xl leading-relaxed">{def.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label="O16 operating status">
            <StatusBadge tone={toneForStatus(bms)}>{`BMS ${bms}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(tel)}>{`Telemetry ${tel}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(fresh)}>{`Data ${fresh}`}</StatusBadge>
            <StatusBadge tone="neutral" pulse={false}>{`Mode ${mode}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(safety)}>{`Safety ${safety === 'REJECT' ? 'BLOCK' : safety}`}</StatusBadge>
            <StatusBadge tone={data?.header?.safe_mode || data?.safe_mode ? 'warn' : 'muted'} pulse={false}>
              SAFE MODE {data?.header?.safe_mode || data?.safe_mode ? 'ON' : 'OFF'}
            </StatusBadge>
            <StatusBadge tone="muted" pulse={false}>
              Last update {secondsAgo(data?.header?.last_telemetry || data?.evaluated_at)}
            </StatusBadge>
          </div>
        </div>
        <label className="text-[11px] font-mono text-slate-500 shrink-0">
          Condenser plant
          <select
            className="ml-2 bg-white border border-slate-200 text-slate-800 px-2 py-1 rounded-md focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Condenser plant"
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="all">All registered equipment</option>
            {equipment.map((e) => (
              <option key={e.equipment_id || e.name || ''} value={String(e.equipment_id || e.name)}>
                {e.name || e.equipment_id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {building ? (
        <p className="text-[11px] font-mono text-slate-500">Building {fmtDash(building)}</p>
      ) : null}
      {sim && (
        <div className="glass-card p-4 border-amber-500/40" role="status">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-amber-300">BMS OFFLINE — SIMULATED TELEMETRY</div>
          <div className="text-[13px] text-slate-400 mt-1">Simulation is never LIVE. BMS writes are disabled.</div>
        </div>
      )}
    </header>
  );
}
