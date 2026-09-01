'use client';

import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatKw, formatNumber } from '@/lib/hvac/formatters';
import { metricNum, metricStr } from '@/lib/hvac/omTypes';

interface IndicatorRow {
  equipment: string;
  indicator: string;
  current: string;
  reference: string;
  deviation: string;
  severity: string;
  recommendation: string;
  status: string;
}

export function DiagnosticIndicatorsTable({ data }: { data: OmOpportunity }) {
  const eq = metricStr(data.metrics, 'equipment_id') || '—';
  const dp = metricNum(data.metrics, 'filter_dp_rise_pct');
  const drift = metricNum(data.metrics, 'sensor_drift_pct');
  const cycles = metricNum(data.metrics, 'cycle_count') ?? metricNum(data.metrics, 'excessive_cycles');
  const fan = metricNum(data.metrics, 'fan_power_kw');
  const runtime = metricNum(data.metrics, 'runtime_hours');
  const rec = data.recommendation?.action || data.recommendation?.rationale || '—';
  const status = data.status || '—';
  const rows: IndicatorRow[] = [];
  if (dp != null) {
    rows.push({
      equipment: eq,
      indicator: 'Filter ΔP rise',
      current: `${formatNumber(dp, 1)} %`,
      reference: 'Maintenance baseline (flag ≥ 20%)',
      deviation: `${formatNumber(dp, 1)} %`,
      severity: dp >= 50 ? 'P1' : dp >= 20 ? 'P2' : 'NORMAL',
      recommendation: formatDash(rec),
      status: formatDash(status),
    });
  }
  if (drift != null) {
    rows.push({
      equipment: eq,
      indicator: 'Sensor drift',
      current: `${formatNumber(drift, 1)} %`,
      reference: 'Calibration baseline (flag ≥ 5%)',
      deviation: `${formatNumber(Math.abs(drift), 1)} %`,
      severity: Math.abs(drift) >= 12 ? 'P1' : Math.abs(drift) >= 5 ? 'P2' : 'NORMAL',
      recommendation: formatDash(rec),
      status: formatDash(status),
    });
  }
  if (cycles != null) {
    rows.push({
      equipment: eq,
      indicator: 'Cycling',
      current: formatNumber(cycles, 0),
      reference: 'Evaluation window (flag ≥ 8)',
      deviation: cycles >= 8 ? formatNumber(cycles, 0) : '—',
      severity: cycles >= 8 ? 'P2' : 'NORMAL',
      recommendation: formatDash(rec),
      status: formatDash(status),
    });
  }
  if (fan != null) {
    rows.push({
      equipment: eq,
      indicator: 'Fan power',
      current: formatKw(fan),
      reference: '—',
      deviation: '—',
      severity: '—',
      recommendation: formatDash(rec),
      status: formatDash(status),
    });
  }
  if (runtime != null) {
    rows.push({
      equipment: eq,
      indicator: 'Runtime',
      current: `${formatNumber(runtime, 0)} h`,
      reference: '—',
      deviation: '—',
      severity: '—',
      recommendation: formatDash(rec),
      status: formatDash(status),
    });
  }

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Diagnostic indicators">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Diagnostic indicators</h2>
      <EngineeringTable>
        <thead>
          <tr>
            <th>Equipment</th>
            <th>Indicator</th>
            <th>Current Value</th>
            <th>Expected/Reference</th>
            <th>Deviation</th>
            <th>Severity</th>
            <th>Recommendation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <TableEmptyState colSpan={8} detail="No diagnostic indicator rows were returned." />
          ) : (
            rows.map((r) => (
              <tr key={r.indicator}>
                <td className="font-mono">{r.equipment}</td>
                <td>{r.indicator}</td>
                <td className="font-mono">{r.current}</td>
                <td>{r.reference}</td>
                <td className="font-mono">{r.deviation}</td>
                <td>
                  <StatusBadge tone={toneForStatus(r.severity)}>{r.severity}</StatusBadge>
                </td>
                <td>{r.recommendation}</td>
                <td className="font-mono">{r.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </EngineeringTable>
    </section>
  );
}
