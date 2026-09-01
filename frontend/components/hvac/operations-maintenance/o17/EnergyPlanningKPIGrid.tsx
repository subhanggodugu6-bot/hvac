'use client';

import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';
import {
  o17BaselineKw,
  o17ConfidencePct,
  o17CurrentKw,
  o17ImpactKw,
  o17Kw,
  o17QualityLabel,
  o17SecondsAgo,
  o17TargetKw,
  o17Trend,
} from '@/lib/hvac/o17Format';

function Card({
  label,
  value,
  unit,
  status,
  trend,
  timestamp,
}: {
  label: string;
  value: string;
  unit: string;
  status: string;
  trend: string;
  timestamp: string;
}) {
  return (
    <article className="kpi-tile min-h-[118px]" aria-label={label}>
      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-bold font-mono text-slate-900 tracking-tight">{value}</span>
        <span className="text-[11px] font-mono text-slate-500">{unit}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-500">
        <span>Status {status}</span>
        <span>Trend {trend}</span>
        <span className="truncate" title={timestamp}>
          {timestamp}
        </span>
      </div>
    </article>
  );
}

export function EnergyPlanningKPIGrid({ data, dash }: { data: OmOpportunity; dash?: OmDashboardData }) {
  const ts = o17SecondsAgo(data.telemetry?.lastUpdated || data.timestamp);
  const current = o17CurrentKw(data, dash);
  const baseline = o17BaselineKw(data, dash);
  const target = o17TargetKw(data, dash);
  const impact = o17ImpactKw(data, dash);
  const vsBaseline = o17Trend(current, baseline);
  const vsTarget = o17Trend(current, target);
  const quality = o17QualityLabel(data);
  const conf = o17ConfidencePct(data.recommendation?.confidence ?? data.confidence);

  const items = [
    {
      label: 'Energy Planning Status',
      value: formatDash(data.status),
      unit: 'state',
      status: formatDash(data.supervisory?.decision),
      trend: '—',
    },
    {
      label: 'Current Energy Performance',
      value: current == null ? '—' : formatDash(Number(current).toFixed(1)),
      unit: 'kW',
      status: quality,
      trend: vsBaseline,
    },
    {
      label: 'Planning Opportunity',
      value: formatDash(data.recommendation?.action),
      unit: 'action',
      status: formatDash(data.priority),
      trend: '—',
    },
    {
      label: 'Estimated Energy Impact',
      value: impact == null ? '—' : formatDash(Number(impact).toFixed(1)),
      unit: 'kW',
      status: formatDash(data.recommendation?.action),
      trend: vsTarget,
    },
    {
      label: 'Baseline Performance',
      value: baseline == null ? '—' : formatDash(Number(baseline).toFixed(1)),
      unit: 'kW',
      status: baseline == null ? '—' : 'BASELINE',
      trend: '—',
    },
    {
      label: 'Current Performance',
      value: current == null ? '—' : formatDash(Number(current).toFixed(1)),
      unit: 'kW',
      status: quality,
      trend: vsBaseline,
    },
    {
      label: 'Recommendation Confidence',
      value: conf,
      unit: '',
      status: formatDash(data.supervisory?.decision),
      trend: '—',
    },
    {
      label: 'Data Quality',
      value: quality,
      unit: 'class',
      status: quality,
      trend: '—',
    },
  ];

  return (
    <section className="col-span-12" aria-label="O17 KPI grid">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <Card key={item.label} {...item} timestamp={ts} />
        ))}
      </div>
      <p className="sr-only">{o17Kw(current)} current versus {o17Kw(baseline)} baseline</p>
    </section>
  );
}
