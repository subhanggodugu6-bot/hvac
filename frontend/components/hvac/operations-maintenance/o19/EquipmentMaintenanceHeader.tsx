'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { formatDash, formatPercent, formatKw } from '@/lib/hvac/formatters';
import {
  O19_GUIDE_DESCRIPTION,
  isO19Simulation,
  o19Bms,
  o19FleetStatus,
  o19Freshness,
  o19Mode,
  o19QualityLabel,
  o19SecondsAgo,
  o19TelemetryBadge,
} from '@/lib/hvac/o19Format';

export function EquipmentMaintenanceHeader({
  data,
  dash,
  platform,
}: {
  data: OmOpportunity;
  dash?: OmDashboardData;
  buildingName?: string | null;
  platform?: PlatformGate | null;
}) {
  const fleet = o19FleetStatus(data);
  const catalog = getOpportunity('O19');
  const def = catalog || getOpportunity('O19')!;
  const description = data.description || catalog?.description || O19_GUIDE_DESCRIPTION;
  const mode = platform?.safeMode ? 'SAFE_MODE' : o19Mode(dash);
  return (
    <header className="px-5 pt-5 pb-4 space-y-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-violet-700 mb-1.5">O19</div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{def.title}</h1>
          <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label="O19 system status">
            <StatusBadge tone={toneForStatus(o19Bms(dash, data))}>{`BMS ${o19Bms(dash, data)}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(o19TelemetryBadge(data))}>{`Telemetry ${o19TelemetryBadge(data)}`}</StatusBadge>
            <StatusBadge tone="neutral" pulse={false}>{`Mode ${mode}`}</StatusBadge>
            <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'} pulse={false}>
              {`SAFE MODE ${platform?.safeMode ? 'ON' : 'OFF'}`}
            </StatusBadge>
            <StatusBadge tone={toneForStatus(data.safety?.status)}>{`Safety ${formatDash(data.safety?.status)}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(o19Freshness(data))}>{`Freshness ${o19Freshness(data)}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(o19QualityLabel(data))}>{`Quality ${o19QualityLabel(data)}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(fleet)} pulse={false}>
              {fleet}
            </StatusBadge>
          </div>
        </div>
      </div>
      {isO19Simulation(data) ? (
        <div className="glass-card p-4" role="status">
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-300">SIMULATED</div>
          <p className="text-[13px] text-slate-600 mt-1">Demo / simulation records are never labeled LIVE. This page does not write HVAC setpoints.</p>
        </div>
      ) : null}
      <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-[11px]">
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Equipment health</dt>
          <dd className="font-mono text-slate-800 mt-1">{formatPercent(data.current?.equipmentHealthPct)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Assets at risk</dt>
          <dd className="font-mono text-slate-800 mt-1">{formatDash(data.current?.assetsAtRisk)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Findings</dt>
          <dd className="font-mono text-slate-800 mt-1">{formatDash(data.current?.maintenanceAlerts)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Energy loss</dt>
          <dd className="font-mono text-slate-800 mt-1">{formatKw(data.energy?.impactKw)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Recommendation</dt>
          <dd className="font-mono text-slate-800 mt-1">{formatDash(data.recommendation?.action)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Last evaluation</dt>
          <dd className="font-mono text-slate-800 mt-1">{o19SecondsAgo(data.telemetry?.lastUpdated || data.timestamp)}</dd>
        </div>
      </dl>
    </header>
  );
}
