'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioModuleHeader, StudioSimulatedBanner } from '@/components/hvac/StudioModuleHeader';
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
  const def = getOpportunity('O19')!;
  const description = data.description || def.description || O19_GUIDE_DESCRIPTION;
  const mode = platform?.safeMode ? 'SAFE_MODE' : o19Mode(dash);

  return (
    <StudioModuleHeader
      def={def}
      code="O19"
      title={def.title}
      description={description}
      badges={
        <>
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
        </>
      }
      banner={
        isO19Simulation(data) ? (
          <StudioSimulatedBanner detail="Demo / simulation records are never labeled LIVE. This page does not write HVAC setpoints." />
        ) : null
      }
      metrics={
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
      }
    />
  );
}
