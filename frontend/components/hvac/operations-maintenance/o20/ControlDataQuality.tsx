'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { formatAgeSeconds, formatDash } from '@/lib/hvac/formatters';
import { isO20Simulation, o20Bms, o20Counts, o20Freshness, o20QualityLabel, o20SecondsAgo, o20TelemetryBadge } from '@/lib/hvac/o20Format';

export function ControlDataQuality({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const c = o20Counts(data);
  const coverage = c.points == null ? '—' : `${c.points} points scored`;
  return (
    <section className="kpi-tile space-y-3" aria-label="Data quality">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Data quality</h2>
      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <dt className="text-slate-500">BMS Connection</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o20Bms(dash, data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Telemetry Source</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.telemetry?.source || data.source)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Quality</dt>
          <dd className="mt-0.5">
            <StatusBadge tone={toneForStatus(o20QualityLabel(data))}>{o20QualityLabel(data)}</StatusBadge>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Last Seen</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o20SecondsAgo(data.telemetry?.lastUpdated || data.timestamp)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Freshness</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o20Freshness(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Data Coverage</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{coverage}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Age</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatAgeSeconds(data.telemetry?.ageSeconds)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Classified telemetry</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o20TelemetryBadge(data)}</dd>
        </div>
      </dl>
      {isO20Simulation(data) ? <p className="text-[11px] font-semibold text-amber-300">SIMULATED — never LIVE.</p> : null}
    </section>
  );
}
