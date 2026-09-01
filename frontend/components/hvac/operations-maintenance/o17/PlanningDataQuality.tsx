'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { formatAgeSeconds, formatDash } from '@/lib/hvac/formatters';
import { isO17Simulation, o17Bms, o17Freshness, o17QualityLabel, o17SecondsAgo, o17TelemetryBadge } from '@/lib/hvac/o17Format';

export function PlanningDataQuality({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const quality = o17QualityLabel(data);
  const last = data.telemetry?.lastUpdated || data.timestamp;
  const coverage =
    o17CurrentKwSafe(data) != null ? 'SNAPSHOT PRESENT' : 'NO DATA';
  return (
    <section className="kpi-tile space-y-3" aria-label="Data quality">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Data quality / telemetry</h2>
      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <dt className="text-slate-500">Telemetry Source</dt>
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
          <dd className="font-mono text-slate-800 mt-0.5">{o17SecondsAgo(last)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Freshness</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17Freshness(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Data Coverage</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{coverage}</dd>
        </div>
        <div>
          <dt className="text-slate-500">BMS Connection</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17Bms(dash, data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Age</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatAgeSeconds(data.telemetry?.ageSeconds)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Classified status</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o17TelemetryBadge(data)}</dd>
        </div>
      </dl>
      {isO17Simulation(data) ? (
        <p className="text-[11px] text-amber-300">SIMULATION — not LIVE.</p>
      ) : null}
    </section>
  );
}

function o17CurrentKwSafe(data: OmOpportunity): number | null {
  const v = data.energy?.currentKw ?? data.current?.kw;
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
}
