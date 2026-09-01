'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioModuleHeader, StudioSimulatedBanner } from '@/components/hvac/StudioModuleHeader';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import {
  O17_GUIDE_DESCRIPTION,
  isO17Simulation,
  o17Bms,
  o17ConfidencePct,
  o17Freshness,
  o17ImpactKw,
  o17Kw,
  o17Mode,
  o17PlanningPeriod,
  o17Safety,
  o17SecondsAgo,
  o17TelemetryBadge,
} from '@/lib/hvac/o17Format';
import { formatDash } from '@/lib/hvac/formatters';

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function EnergyPlanningHeader({
  data,
  dash,
  platform,
}: {
  data: OmOpportunity;
  dash?: OmDashboardData;
  buildingName?: string | null;
  platform?: PlatformGate | null;
}) {
  const sim = isO17Simulation(data);
  const def = getOpportunity('O17')!;
  const description = data.description || def.description || O17_GUIDE_DESCRIPTION;
  const ts = data.telemetry?.lastUpdated || data.timestamp || null;
  const mode = platform?.safeMode ? 'SAFE_MODE' : o17Mode(dash);

  return (
    <StudioModuleHeader
      def={def}
      code="O17"
      title={def.title}
      description={description}
      badges={
        <>
          <StatusBadge tone={toneForStatus(o17Bms(dash, data))}>{`BMS ${o17Bms(dash, data)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(o17TelemetryBadge(data))}>{`Telemetry ${o17TelemetryBadge(data)}`}</StatusBadge>
          <StatusBadge tone="neutral" pulse={false}>{`Mode ${mode}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(o17Safety(data))}>{`Safety ${o17Safety(data)}`}</StatusBadge>
          <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'} pulse={false}>
            {`SAFE MODE ${platform?.safeMode ? 'ON' : 'OFF'}`}
          </StatusBadge>
          <StatusBadge tone={toneForStatus(o17Freshness(data))}>{`Freshness ${o17Freshness(data)}`}</StatusBadge>
          <StatusBadge tone={toneForStatus(data.status)}>{`Opportunity ${formatDash(data.status)}`}</StatusBadge>
        </>
      }
      actions={
        <>
          <button type="button" className="btn-primary" onClick={() => scrollTo('o17-recommendation')}>
            View recommendation
          </button>
          <button type="button" className="btn-secondary" onClick={() => scrollTo('o17-engineering')}>
            Engineering details
          </button>
        </>
      }
      banner={sim ? <StudioSimulatedBanner /> : null}
      metrics={
        <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-[11px]">
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Opportunity status</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatDash(data.status)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Current recommendation</dt>
            <dd className="font-mono text-slate-800 mt-1">{formatDash(data.recommendation?.action)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Potential energy impact</dt>
            <dd className="font-mono text-slate-800 mt-1">{o17Kw(o17ImpactKw(data, dash))}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Planning period</dt>
            <dd className="font-mono text-slate-800 mt-1">{o17PlanningPeriod(data)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Confidence</dt>
            <dd className="font-mono text-slate-800 mt-1">{o17ConfidencePct(data.recommendation?.confidence ?? data.confidence)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.16em] text-slate-500">Last evaluation</dt>
            <dd className="font-mono text-slate-800 mt-1">{o17SecondsAgo(ts)}</dd>
          </div>
        </dl>
      }
    />
  );
}
