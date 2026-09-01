'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatKw, formatNumber, formatPercent } from '@/lib/hvac/formatters';
import { metricNum } from '@/lib/hvac/omTypes';
import { o19EquipmentRows, o19Findings, o19QualityLabel, o19SecondsAgo, o19TelemetryBadge } from '@/lib/hvac/o19Format';

export function EquipmentDetailPanel({ data, selectedId }: { data: OmOpportunity; selectedId: string | null }) {
  const rows = o19EquipmentRows(data);
  const eq = rows?.find((r) => r.id === selectedId) || rows?.[0] || null;
  const findings = (o19Findings(data) || []).filter((f) => !eq || f.equipmentId === eq.id);
  if (!eq) {
    return (
      <section className="kpi-tile" aria-label="Equipment detail">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Equipment detail</h2>
        <EmptyState title="NO DATA AVAILABLE" detail="Select equipment with a returned identifier." />
      </section>
    );
  }
  return (
    <section className="kpi-tile space-y-3" aria-label="Equipment detail">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Equipment detail</h2>
      <div className="flex justify-between gap-2">
        <div>
          <div className="font-mono text-sm text-slate-900">{eq.id}</div>
          <div className="text-[11px] text-slate-500">{eq.type}</div>
        </div>
        <StatusBadge tone={toneForStatus(eq.status)}>{eq.status}</StatusBadge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Operating condition</dt>
          <dd className="font-mono text-slate-800 mt-0.5">Health {formatPercent(eq.health)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Telemetry freshness</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19SecondsAgo(eq.lastSeen)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Quality</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{o19QualityLabel(data)} · {o19TelemetryBadge(data)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Maintenance priority</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(eq.priority)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Filter ΔP rise</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatDash(metricNum(data.metrics, 'filter_dp_rise_pct'))}{metricNum(data.metrics, 'filter_dp_rise_pct') == null ? '' : '%'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Fan power</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{formatKw(metricNum(data.metrics, 'fan_power_kw'))}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Runtime</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{metricNum(data.metrics, 'runtime_hours') == null ? '—' : `${formatNumber(metricNum(data.metrics, 'runtime_hours'), 0)} h`}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recommendation</dt>
          <dd className="text-slate-700 mt-0.5">{formatDash(data.recommendation?.action)}</dd>
        </div>
      </dl>
      <div>
        <h3 className="text-[11px] text-slate-500 mb-1">Recent activity</h3>
        {findings.length === 0 ? (
          <p className="text-[11px] font-mono text-amber-300">NO DATA AVAILABLE</p>
        ) : (
          <ul className="text-[11px] text-slate-400 space-y-1">
            {findings.map((f) => (
              <li key={f.id || f.finding || f.maintenanceType}>
                {formatDash(f.status)} · {formatDash(f.recommendation || f.finding)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
