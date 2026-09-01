'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioModuleHeader, StudioSimulatedBanner } from '@/components/hvac/StudioModuleHeader';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import {
  O18_GUIDE_DESCRIPTION,
  isO18Simulation,
  o18Affected,
  o18Bms,
  o18Coverage,
  o18Freshness,
  o18Mode,
  o18SecondsAgo,
  o18TelemetryBadge,
} from '@/lib/hvac/o18Format';

export function TrainingAwarenessHeader({
  data,
  dash,
  platform,
}: {
  data: OmOpportunity;
  dash?: OmDashboardData;
  buildingName?: string | null;
  platform?: PlatformGate | null;
}) {
  const def = getOpportunity('O18')!;
  const description = data.description || def.description || O18_GUIDE_DESCRIPTION;
  const ts = data.telemetry?.lastUpdated || data.timestamp;

  return (
    <StudioModuleHeader
      def={def}
      code="O18"
      title={def.title}
      description={description}
      badges={
        <>
          <StatusBadge tone={toneForStatus(o18Bms(dash, data))}>{`BMS ${o18Bms(dash, data)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(o18TelemetryBadge(data))}>{`Telemetry ${o18TelemetryBadge(data)}`}</StatusBadge>
          <StatusBadge tone="neutral" pulse={false}>
            {`Mode ${platform?.safeMode ? 'SAFE_MODE' : o18Mode(dash)}`}
          </StatusBadge>
          <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'} pulse={false}>
            {`SAFE MODE ${platform?.safeMode ? 'ON' : 'OFF'}`}
          </StatusBadge>
          <StatusBadge tone={toneForStatus(data.safety?.status)}>{`Safety ${formatDash(data.safety?.status)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(o18Freshness(data))}>{`Freshness ${o18Freshness(data)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(data.status)}>{`Opportunity ${formatDash(data.status)}`}</StatusBadge>
        </>
      }
      actions={
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={() => document.getElementById('o18-recommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          View recommendations
        </button>
      }
      banner={
        isO18Simulation(data) ? (
          <StudioSimulatedBanner detail="Demo / simulation records are never labeled LIVE. This page does not dispatch HVAC equipment." />
        ) : null
      }
      metrics={
        <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-[11px]">
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Training Status</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatDash(data.current?.operatorReadiness || data.status)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Completion</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatPercent(o18Coverage(data))}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Affected Users</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatDash(o18Affected(data))}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Training items</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatDash(data.current?.trainingItems)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Last Evaluation</dt>
            <dd className="font-mono text-slate-800 mt-1">{o18SecondsAgo(ts)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Recommendation Status</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatDash(data.recommendation?.action)}</dd>
          </div>
        </dl>
      }
    />
  );
}
