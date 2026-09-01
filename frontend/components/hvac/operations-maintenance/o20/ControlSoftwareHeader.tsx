'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';
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
  const catalog = getOpportunity('O20');
  const def = catalog || getOpportunity('O20')!;
  const description = data.description || catalog?.description || O20_GUIDE_DESCRIPTION;
  const health = formatDash(data.current?.controllerHealth);
  const mode = platform?.safeMode ? 'SAFE_MODE' : o20Mode(dash);
  return (
    <header className="px-5 pt-5 pb-4 space-y-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-violet-700 mb-1.5">O20</div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{def.title}</h1>
          <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label="O20 system status">
            <StatusBadge tone={toneForStatus(o20Bms(dash, data))}>{`BMS ${o20Bms(dash, data)}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(o20TelemetryBadge(data))}>{`Telemetry ${o20TelemetryBadge(data)}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(health)}>{`Control Health ${health}`}</StatusBadge>
            <StatusBadge tone="neutral" pulse={false}>{`Mode ${mode}`}</StatusBadge>
            <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'} pulse={false}>
              {`SAFE MODE ${platform?.safeMode ? 'ON' : 'OFF'}`}
            </StatusBadge>
            <StatusBadge tone={toneForStatus(data.safety?.status)}>{`Safety ${formatDash(data.safety?.status)}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(o20Freshness(data))}>{`Freshness ${o20Freshness(data)}`}</StatusBadge>
          </div>
        </div>
      </div>
      {isO20Simulation(data) ? (
        <div className="glass-card p-4" role="status">
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-300">SIMULATED</div>
          <p className="text-[13px] text-slate-600 mt-1">Demo / simulation is never LIVE. Automatic software deploy is prohibited.</p>
        </div>
      ) : null}
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
    </header>
  );
}
