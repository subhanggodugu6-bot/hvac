'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';
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
  const sim = isO18Simulation(data);
  const catalog = getOpportunity('O18');
  const def = catalog || getOpportunity('O18')!;
  const description = data.description || catalog?.description || O18_GUIDE_DESCRIPTION;
  const ts = data.telemetry?.lastUpdated || data.timestamp;

  return (
    <header className="px-5 pt-5 pb-4 space-y-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-cyan-400/80 mb-1.5">O18</div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{def.title}</h1>
          <p className="text-[13px] text-slate-400 mt-1.5 max-w-3xl leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label="O18 system status">
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
          </div>
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={() => document.getElementById('o18-recommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          View Training Recommendations
        </button>
      </div>
      {sim ? (
        <div className="glass-card p-4" role="status">
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-300">SIMULATED</div>
          <p className="text-[13px] text-slate-400 mt-1">Demo / simulation records are never labeled LIVE. This page does not dispatch HVAC equipment.</p>
        </div>
      ) : null}
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
    </header>
  );
}
