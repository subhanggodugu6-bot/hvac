'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O16Dashboard, O16EquipmentRow } from '@/lib/hvac/o16Types';
import { bmsBadge, fmtDash, freshnessBadge, isSimulation, secondsAgo, telemetryBadge } from '@/lib/hvac/o16Format';
import { StudioModuleHeader } from '@/components/hvac/StudioModuleHeader';
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
    <StudioModuleHeader
      def={def}
      code="O16"
      title={def.title}
      description={def.description}
      badges={
        <>
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
        </>
      }
      actions={
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
      }
      banner={
        <>
          {building ? <p className="text-[11px] font-mono text-slate-500">Building {fmtDash(building)}</p> : null}
          {sim ? (
            <div className="glass-card p-4 border-amber-500/40" role="status">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-amber-800">BMS OFFLINE — SIMULATED TELEMETRY</div>
              <div className="text-[13px] text-slate-600 mt-1">Simulation is never LIVE. BMS writes are disabled.</div>
            </div>
          ) : null}
        </>
      }
    />
  );
}
