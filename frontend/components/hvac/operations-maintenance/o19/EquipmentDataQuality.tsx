'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { formatAgeSeconds, formatDash } from '@/lib/hvac/formatters';
import { isO19Simulation, o19Bms, o19EquipmentRows, o19Freshness, o19QualityLabel, o19SecondsAgo, o19TelemetryBadge } from '@/lib/hvac/o19Format';

export function EquipmentDataQuality({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const rows = o19EquipmentRows(data);
  const coverage = rows == null ? '—' : `${rows.length} asset id(s)`;
  return (
    <section className="kpi-tile space-y-3" aria-label="Data quality">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Data quality</h2>
      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <dt className="text-slate-500">Source</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(data.telemetry?.source || data.source)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">BMS Status</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19Bms(dash, data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Telemetry Quality</dt>
          <dd className="mt-0.5">
            <StatusBadge tone={toneForStatus(o19QualityLabel(data))}>{o19QualityLabel(data)}</StatusBadge>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Last Seen</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19SecondsAgo(data.telemetry?.lastUpdated || data.timestamp)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Freshness</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19Freshness(data)}</dd>
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
          <dd className="font-mono text-slate-800 mt-0.5">{o19TelemetryBadge(data)}</dd>
        </div>
      </dl>
      {isO19Simulation(data) ? <p className="text-[11px] font-semibold text-amber-300">SIMULATED — never LIVE.</p> : null}
    </section>
  );
}
