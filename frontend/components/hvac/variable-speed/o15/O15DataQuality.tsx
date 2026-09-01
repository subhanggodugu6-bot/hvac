'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import { fmtDash, secondsAgo } from '@/lib/hvac/o15Format';

export function O15DataQuality({ data }: { data: O15Dashboard }) {
  const ui = (data.ui_state || data.header?.ui_state || '').toUpperCase();
  const tel = (data.header?.telemetry || data.classified_telemetry?.status || 'MISSING').toUpperCase();
  const sourceRaw = (data.classified_telemetry?.source || '').toUpperCase();
  const sim = ui === 'SIMULATION' || sourceRaw.includes('SIMUL') || tel === 'SIMULATED';
  const source = sim ? 'SIMULATION' : data.live ? 'LIVE' : sourceRaw || '—';
  const quality = sim ? 'SIMULATION' : tel === 'LIVE' ? 'GOOD' : tel || 'NO DATA';
  let health = 'NO DATA';
  if (sim) health = 'SIMULATION';
  else if (tel === 'STALE' || ui === 'STALE') health = 'STALE';
  else if (tel === 'BAD') health = 'BAD';
  else if (data.live || tel === 'GOOD' || tel === 'LIVE') health = 'HEALTHY';
  return (
    <section className="kpi-tile space-y-2" aria-labelledby="o15-dq">
      <h2 id="o15-dq" className="text-sm font-semibold text-slate-900">
        Data Quality
      </h2>
      <div className="text-xs font-mono space-y-1 text-slate-700">
        <div>Source {source}</div>
        <div>Quality {quality}</div>
        <div>Last Seen {fmtDash(data.header?.last_telemetry || data.evaluated_at)}</div>
        <div>Age {data.classified_telemetry?.age_seconds != null ? `${fmtDash(data.classified_telemetry.age_seconds)} seconds` : secondsAgo(data.evaluated_at)}</div>
        <div>Gap —</div>
      </div>
      <StatusBadge tone={toneForStatus(health)}>{health}</StatusBadge>
      {sim && (
        <div className="text-xs font-semibold text-amber-300" role="status">
          SIMULATION DATA — BMS WRITE DISABLED
        </div>
      )}
    </section>
  );
}
