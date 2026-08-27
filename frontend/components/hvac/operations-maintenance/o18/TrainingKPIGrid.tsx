'use client';

import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatKwh, formatPercent } from '@/lib/hvac/formatters';
import {
  isO18Simulation,
  o18Affected,
  o18Counts,
  o18Coverage,
  o18EnergyImpact,
  o18Gaps,
  o18Programs,
  o18QualityLabel,
  o18SecondsAgo,
} from '@/lib/hvac/o18Format';

function Card({
  label,
  value,
  unit,
  status,
  timestamp,
}: {
  label: string;
  value: string;
  unit: string;
  status: string;
  timestamp: string;
}) {
  return (
    <article className="kpi-tile min-h-[118px]" aria-label={label}>
      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-bold font-mono text-slate-900 tracking-tight">{value}</span>
        <span className="text-[11px] font-mono text-slate-500">{unit}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-500">
        <span>Status {status}</span>
        <span className="truncate text-right">{timestamp}</span>
      </div>
    </article>
  );
}

export function TrainingKPIGrid({ data }: { data: OmOpportunity }) {
  const ts = o18SecondsAgo(data.telemetry?.lastUpdated || data.timestamp);
  const counts = o18Counts(o18Programs(data));
  const gaps = o18Gaps(data);
  const coverage = o18Coverage(data);
  const quality = isO18Simulation(data) ? 'SIMULATED' : o18QualityLabel(data);
  const recCount = gaps ? gaps.length : data.recommendation?.action ? 1 : null;
  const impact = o18EnergyImpact(data);
  const items = [
    {
      label: 'Training Items',
      value: counts.total == null ? '—' : String(counts.total),
      unit: 'programs',
      status: formatDash(data.status),
    },
    {
      label: 'Affected Users',
      value: formatDash(o18Affected(data)),
      unit: 'roles/users',
      status: formatDash(data.current?.operatorReadiness),
    },
    {
      label: 'Completion %',
      value: formatPercent(coverage),
      unit: '',
      status: coverage == null ? '—' : 'SCORED',
    },
    {
      label: 'Pending Training',
      value: counts.pending == null ? '—' : String(counts.pending),
      unit: 'items',
      status: counts.pending == null ? '—' : counts.pending > 0 ? 'PENDING' : 'CLEAR',
    },
    {
      label: 'Completed Training',
      value: counts.completed == null ? '—' : String(counts.completed),
      unit: 'items',
      status: counts.completed == null ? '—' : 'COMPLETED',
    },
    {
      label: 'Energy Impact',
      value: formatKwh(impact, true),
      unit: '',
      status: impact == null ? '—' : 'ESTIMATED',
    },
    {
      label: 'Recommendation Count',
      value: recCount == null ? '—' : String(recCount),
      unit: 'actions',
      status: formatDash(data.recommendation?.action),
    },
    {
      label: 'Data Quality',
      value: quality,
      unit: 'class',
      status: quality,
    },
  ];
  return (
    <section className="col-span-12" aria-label="Training KPI grid">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <Card key={item.label} {...item} timestamp={ts} />
        ))}
      </div>
    </section>
  );
}
