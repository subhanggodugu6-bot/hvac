'use client';

import { useMemo, useState } from 'react';
import { EngineeringTable } from '@/components/hvac/EngineeringTable';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { OmDashboardData, OmOpportunity, TelemetryValue } from '@/lib/hvac/omTypes';
import { formatDash, formatKw, formatNumber } from '@/lib/hvac/formatters';
import {
  o17BaselineKw,
  o17ConfidencePct,
  o17CurrentKw,
  o17ImpactKw,
  o17RecCardStatus,
  o17SecondsAgo,
  o17TargetKw,
} from '@/lib/hvac/o17Format';
import { metricNum } from '@/lib/hvac/omTypes';

interface Row {
  item: string;
  current: string;
  baseline: string;
  target: string;
  impact: string;
  confidence: string;
  status: string;
  updated: string;
}

function fmtMaybeKw(v: TelemetryValue): string {
  return v == null ? '—' : formatKw(v);
}

function fmtMaybeNum(v: TelemetryValue, unit: string): string {
  if (v == null) return '—';
  return `${formatNumber(v, 1)} ${unit}`;
}

export function PlanningTable({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<keyof Row>('item');
  const [asc, setAsc] = useState(true);
  const status = o17RecCardStatus(data);
  const updated = o17SecondsAgo(data.telemetry?.lastUpdated || data.timestamp);
  const conf = o17ConfidencePct(data.recommendation?.confidence ?? data.confidence);

  const rows = useMemo<Row[]>(() => {
    const occupancy = data.current?.occupancy ?? metricNum(data.metrics, 'occupancy');
    const outdoor = metricNum(data.metrics, 'outdoor_temp_c');
    const peak = data.energy?.peakDemandKw ?? metricNum(data.metrics, 'peak_demand_kw');
    const daily = data.energy?.dailyKwh ?? metricNum(data.metrics, 'daily_energy_kwh') ?? metricNum(data.metrics, 'daily_kwh');
    return [
      {
        item: 'HVAC / electrical power',
        current: fmtMaybeKw(o17CurrentKw(data, dash)),
        baseline: fmtMaybeKw(o17BaselineKw(data, dash)),
        target: fmtMaybeKw(o17TargetKw(data, dash)),
        impact: fmtMaybeKw(o17ImpactKw(data, dash)),
        confidence: conf,
        status,
        updated,
      },
      {
        item: 'Peak demand',
        current: fmtMaybeKw(peak),
        baseline: '—',
        target: '—',
        impact: '—',
        confidence: conf,
        status,
        updated,
      },
      {
        item: 'Daily energy',
        current: fmtMaybeNum(daily, 'kWh'),
        baseline: '—',
        target: '—',
        impact: '—',
        confidence: conf,
        status,
        updated,
      },
      {
        item: 'Occupancy',
        current: occupancy == null ? '—' : `${formatNumber(occupancy, 1)} %`,
        baseline: '—',
        target: '—',
        impact: '—',
        confidence: conf,
        status,
        updated,
      },
      {
        item: 'Outdoor air temperature',
        current: outdoor == null ? '—' : `${formatNumber(outdoor, 1)} °C`,
        baseline: '—',
        target: '—',
        impact: '—',
        confidence: conf,
        status,
        updated,
      },
    ];
  }, [conf, dash, data, status, updated]);

  const statuses = useMemo(() => ['ALL', ...Array.from(new Set(rows.map((r) => r.status)))], [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!needle) return true;
      return Object.values(r).some((v) => v.toLowerCase().includes(needle));
    });
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [asc, q, rows, sortKey, statusFilter]);

  function toggleSort(key: keyof Row) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  const cols: Array<{ key: keyof Row; label: string }> = [
    { key: 'item', label: 'Planning Item' },
    { key: 'current', label: 'Current State' },
    { key: 'baseline', label: 'Baseline' },
    { key: 'target', label: 'Target' },
    { key: 'impact', label: 'Potential Impact' },
    { key: 'confidence', label: 'Confidence' },
    { key: 'status', label: 'Status' },
    { key: 'updated', label: 'Last Updated' },
  ];

  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Planning data table">
      <div className="flex flex-col md:flex-row md:items-end gap-2">
        <label className="text-[11px] text-slate-500 flex-1">
          Search
          <input
            className="mt-1 w-full bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search planning items"
          />
        </label>
        <label className="text-[11px] text-slate-500">
          Filter
          <select
            className="mt-1 block bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <EngineeringTable>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key}>
                <button
                  type="button"
                  className="font-semibold focus-visible:ring-2 focus-visible:ring-cyan-400"
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  {sortKey === c.key ? (asc ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-amber-300">
                NO DATA AVAILABLE
              </td>
            </tr>
          ) : (
            visible.map((r) => (
              <tr key={r.item}>
                <td>{r.item}</td>
                <td className="font-mono">{r.current}</td>
                <td className="font-mono">{r.baseline}</td>
                <td className="font-mono">{r.target}</td>
                <td className="font-mono">{r.impact}</td>
                <td className="font-mono">{r.confidence}</td>
                <td>
                  <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge>
                </td>
                <td className="font-mono">{r.updated}</td>
              </tr>
            ))
          )}
        </tbody>
      </EngineeringTable>
    </section>
  );
}
