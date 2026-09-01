'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { formatAgeSeconds, formatDash } from '@/lib/hvac/formatters';
import { isO18Simulation, o18Bms, o18Freshness, o18QualityLabel, o18SecondsAgo, o18TelemetryBadge } from '@/lib/hvac/o18Format';

export function TrainingDataQuality({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const quality = isO18Simulation(data) ? 'SIMULATED' : o18QualityLabel(data);
  const last = data.telemetry?.lastUpdated || data.timestamp;
  return (
    <section className="kpi-tile space-y-3" aria-label="Data quality">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Data quality</h2>
      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <dt className="text-slate-500">BMS</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o18Bms(dash, data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Telemetry</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o18TelemetryBadge(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Data Source</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.telemetry?.source || data.source)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Quality</dt>
          <dd className="mt-0.5">
            <StatusBadge tone={toneForStatus(quality)}>{quality}</StatusBadge>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Last Seen</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o18SecondsAgo(last)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Freshness</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o18Freshness(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Age</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatAgeSeconds(data.telemetry?.ageSeconds)}</dd>
        </div>
      </dl>
      {isO18Simulation(data) ? <p className="text-[11px] font-semibold text-amber-300">SIMULATED — never LIVE.</p> : null}
    </section>
  );
}
