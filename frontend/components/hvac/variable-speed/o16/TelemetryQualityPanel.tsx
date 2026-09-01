'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import type { O16Dashboard, O16TelemetryPoint } from '@/lib/hvac/o16Types';
import { fmtDash, isSimulation, secondsAgo } from '@/lib/hvac/o16Format';

function pointStatus(p: O16TelemetryPoint, sim: boolean): string {
  const src = (p.source || '').toUpperCase();
  const classified = (p.classified || p.quality || '').toUpperCase();
  if (sim || src.includes('SIMUL') || src.includes('DEMO') || classified === 'SIMULATED') return 'SIMULATION';
  if (classified === 'STALE') return 'STALE';
  if (classified === 'BAD') return 'BAD';
  if (classified === 'LIVE' || classified === 'GOOD') return 'LIVE';
  return classified || 'NO DATA';
}

export function TelemetryQualityPanel({ data, points }: { data: O16Dashboard; points: O16TelemetryPoint[] }) {
  const sim = isSimulation(data);
  const rows = points.filter((p) => p.point_id);
  return (
    <section className="kpi-tile col-span-12 lg:col-span-7" aria-labelledby="o16-telq">
      <h2 id="o16-telq" className="text-sm font-semibold text-slate-900 mb-2">
        Telemetry Quality
      </h2>
      {sim && (
        <div className="text-[11px] font-semibold text-amber-800 mb-2">
          Quality SIMULATION · Source SIMULATOR · BMS OFFLINE
        </div>
      )}
      {!rows.length ? (
        <EmptyState title="No telemetry available" detail="Canonical CW points have not been ingested." />
      ) : (
        <EngineeringTable>
          <thead>
            <tr>
              <th>Point</th>
              <th>Quality</th>
              <th>Source</th>
              <th>Last Seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 24).map((p) => {
              const status = pointStatus(p, sim);
              return (
                <tr key={p.point_id}>
                  <td>{fmtDash(p.point_id)}</td>
                  <td>{sim ? 'SIMULATION' : fmtDash(p.quality)}</td>
                  <td>{sim ? 'SIMULATOR' : fmtDash(p.source)}</td>
                  <td>{p.timestamp ? secondsAgo(p.timestamp) : p.age_seconds != null ? `${fmtDash(p.age_seconds)} sec` : '—'}</td>
                  <td className={status === 'LIVE' && !sim ? 'text-emerald-700' : status === 'SIMULATION' ? 'text-amber-800' : ''}>
                    {status === 'LIVE' && sim ? 'SIMULATION' : status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </EngineeringTable>
      )}
    </section>
  );
}
