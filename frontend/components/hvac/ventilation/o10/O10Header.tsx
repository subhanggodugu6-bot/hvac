'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { StudioBreadcrumb } from '@/components/hvac/StudioBreadcrumb';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { formatAgeSeconds, formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o10Enth, o10Provenance, o10Str, o10Temp, o10VisualMode } from '@/lib/hvac/o10Format';
import type { VentilationDashboardData, VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

export function O10Header({
  data,
  dash,
  platform,
}: {
  data: VentilationOpportunity;
  dash?: VentilationDashboardData | null;
  platform?: PlatformGate | null;
}) {
  const def = getOpportunity('O10')!;
  const prov = o10Provenance(data);
  const bms = prov === 'LIVE' ? 'CONNECTED' : 'OFFLINE';
  const safety = formatDash(data.safety?.status || platform?.safety);
  const mode = platform?.safeMode ? 'SAFE_MODE' : formatDash(dash?.module?.mode || platform?.mode);
  const description = data.description || def.description;
  return (
    <header className="px-5 pt-5 pb-4 space-y-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-violet-700 mb-1.5">O10</div>
          <h1 className="text-[1.7rem] font-semibold text-slate-900 tracking-tight leading-tight">{def.title}</h1>
          <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5" aria-label="O10 system status">
            <StatusBadge tone={toneForStatus(bms)}>{`BMS ${bms}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(prov)}>{`Telemetry ${prov}`}</StatusBadge>
            <StatusBadge tone="neutral" pulse={false}>{`Mode ${mode}`}</StatusBadge>
            <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'} pulse={false}>
              {`SAFE MODE ${platform?.safeMode ? 'ON' : 'OFF'}`}
            </StatusBadge>
            <StatusBadge tone={toneForStatus(safety)}>{`Safety ${safety}`}</StatusBadge>
            <StatusBadge tone={toneForStatus(data.status)}>{`Opportunity ${formatDash(data.status)}`}</StatusBadge>
            <StatusBadge tone="muted" pulse={false}>
              {data.telemetry?.ageSeconds != null ? `TEL ${formatAgeSeconds(data.telemetry.ageSeconds)}` : 'TEL —'}
            </StatusBadge>
          </div>
        </div>
      </div>
      {prov === 'SIMULATED' ? (
        <div className="glass-card p-4" role="status">
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-amber-300">SIMULATED DATA</div>
          <p className="text-[13px] text-slate-600 mt-1">Demo / simulation telemetry is never labeled LIVE. BMS writes are not implied.</p>
        </div>
      ) : null}
      <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-[11px]">
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Economy mode</dt>
          <dd className="font-mono text-slate-800 mt-1">{o10VisualMode(data)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">OA damper</dt>
          <dd className="font-mono text-slate-800 mt-1">{formatPercent(data.current?.damperPct)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Recommended damper</dt>
          <dd className="font-mono text-slate-800 mt-1">{formatPercent(data.optimized?.damperPct)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Outdoor enthalpy</dt>
          <dd className="font-mono text-slate-800 mt-1">{o10Enth(data, 'outdoor_enthalpy_kj_kg', 'outdoor_enthalpy_kjkg')}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Outdoor temperature</dt>
          <dd className="font-mono text-slate-800 mt-1">{o10Temp(data, 'outdoor_drybulb_c', 'outdoor_temp_c')}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.16em] text-slate-500">Economizer</dt>
          <dd className="font-mono text-slate-800 mt-1">{o10Str(data, 'economizer_status')}</dd>
        </div>
      </dl>
    </header>
  );
}
