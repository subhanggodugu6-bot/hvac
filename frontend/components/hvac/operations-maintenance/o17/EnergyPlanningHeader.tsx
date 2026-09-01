'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';
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
  const bms = o17Bms(dash, data);
  const tel = o17TelemetryBadge(data);
  const fresh = o17Freshness(data);
  const safety = o17Safety(data);
  const mode = platform?.safeMode ? 'SAFE_MODE' : o17Mode(dash);
  const catalog = getOpportunity('O17');
  const def = catalog || getOpportunity('O17')!;
  const description = data.description || catalog?.description || O17_GUIDE_DESCRIPTION;
  const ts = data.telemetry?.lastUpdated || data.timestamp || null;

  return (
    <header className="px-5 pt-5 pb-4 space-y-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-violet-700 mb-1.5">O17</div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{def.title}</h1>
          <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label="O17 system status">
            <StatusBadge tone={toneForStatus(bms)}>{`BMS ${bms}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(tel)}>{`Telemetry ${tel}`}</StatusBadge>
            <StatusBadge tone="neutral" pulse={false}>{`Mode ${mode}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(safety)}>{`Safety ${safety}`}</StatusBadge>
            <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'} pulse={false}>
              {`SAFE MODE ${platform?.safeMode ? 'ON' : 'OFF'}`}
            </StatusBadge>
            <StatusBadge tone={toneForStatus(fresh)}>{`Freshness ${fresh}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(data.status)}>{`Opportunity ${formatDash(data.status)}`}</StatusBadge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" className="btn-primary" onClick={() => scrollTo('o17-recommendation')}>
            View Planning Recommendation
          </button>
          <button type="button" className="btn-secondary" onClick={() => scrollTo('o17-engineering')}>
            View Engineering Details
          </button>
        </div>
      </div>
      {sim ? (
        <div className="glass-card p-4" role="status">
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-300">SIMULATED DATA</div>
          <p className="text-[13px] text-slate-600 mt-1">Demo / simulation telemetry is never labeled LIVE. BMS writes are not implied.</p>
        </div>
      ) : null}
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
    </header>
  );
}
