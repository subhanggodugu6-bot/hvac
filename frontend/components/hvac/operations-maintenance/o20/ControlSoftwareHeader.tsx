'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioModuleHeader, StudioSimulatedBanner } from '@/components/hvac/StudioModuleHeader';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { formatDash } from '@/lib/hvac/formatters';
import {
  O20_GUIDE_DESCRIPTION,
  isO20Simulation,
  o20Bms,
  o20ControllerField,
  o20Freshness,
  o20Mode,
  o20QualityLabel,
  o20SecondsAgo,
  o20TelemetryBadge,
} from '@/lib/hvac/o20Format';

export function ControlSoftwareHeader({
  data,
  dash,
  platform,
}: {
  data: OmOpportunity;
  dash?: OmDashboardData;
  buildingName?: string | null;
  platform?: PlatformGate | null;
}) {
  const def = getOpportunity('O20')!;
  const description = data.description || def.description || O20_GUIDE_DESCRIPTION;
  const health = formatDash(data.current?.controllerHealth);
  const mode = platform?.safeMode ? 'SAFE_MODE' : o20Mode(dash);

  return (
    <StudioModuleHeader
      def={def}
      code="O20"
      title={def.title}
      description={description}
      badges={
        <>
          <StatusBadge tone={toneForStatus(o20Bms(dash, data))}>{`BMS ${o20Bms(dash, data)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(o20TelemetryBadge(data))}>{`Telemetry ${o20TelemetryBadge(data)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(health)}>{`Control Health ${health}`}</StatusBadge>
          <StatusBadge tone="neutral" pulse={false}>{`Mode ${mode}`}</StatusBadge>
          <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'} pulse={false}>
            {`SAFE MODE ${platform?.safeMode ? 'ON' : 'OFF'}`}
          </StatusBadge>
          <StatusBadge tone={toneForStatus(data.safety?.status)}>{`Safety ${formatDash(data.safety?.status)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(o20Freshness(data))}>{`Freshness ${o20Freshness(data)}`}</StatusBadge>
        </>
      }
      banner={
        isO20Simulation(data) ? (
          <StudioSimulatedBanner detail="Demo / simulation is never LIVE. Automatic software deploy is prohibited." />
        ) : null
      }
      metrics={
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Controller</dt>
            <dd className="font-mono text-slate-800 mt-1">{o20ControllerField(data, 'controller_id')}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Software</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatDash(data.current?.softwareVersion)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Quality</dt>
            <dd className="font-mono text-slate-800 mt-1">{o20QualityLabel(data)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Evaluated</dt>
            <dd className="font-mono text-slate-800 mt-1">{o20SecondsAgo(data.telemetry?.lastUpdated || data.timestamp)}</dd>
          </div>
        </dl>
      }
    />
  );
}
