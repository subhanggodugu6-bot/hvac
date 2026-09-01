'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { StudioModuleHeader, StudioSimulatedBanner } from '@/components/hvac/StudioModuleHeader';
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
    <StudioModuleHeader
      def={def}
      code="O10"
      title={def.title}
      description={description}
      badges={
        <>
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
        </>
      }
      banner={prov === 'SIMULATED' ? <StudioSimulatedBanner /> : null}
      metrics={
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
      }
    />
  );
}
