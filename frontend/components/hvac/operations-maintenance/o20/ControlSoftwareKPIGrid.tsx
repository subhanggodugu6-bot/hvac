'use client';

import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o20Counts, o20QualityLabel, o20SecondsAgo } from '@/lib/hvac/o20Format';

function Card({
  label,
  value,
  unit,
  timestamp,
}: {
  label: string;
  value: string;
  unit: string;
  timestamp: string;
}) {
  return (
    <article className="kpi-tile min-h-[104px]" aria-label={label}>
      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-bold font-mono text-slate-900">{value}</span>
        <span className="text-[11px] font-mono text-slate-500">{unit}</span>
      </div>
      <div className="mt-2 text-[10px] font-mono text-slate-500">{timestamp}</div>
    </article>
  );
}

export function ControlSoftwareKPIGrid({ data }: { data: OmOpportunity }) {
  const ts = o20SecondsAgo(data.telemetry?.lastUpdated || data.timestamp);
  const c = o20Counts(data);
  const recs = data.recommendation?.action ? 1 : null;
  const items = [
    { label: 'Control Points', value: formatDash(c.points), unit: 'pts' },
    { label: 'Healthy Points', value: formatDash(c.healthy), unit: 'pts' },
    { label: 'Override Points', value: formatDash(c.overrides), unit: 'pts' },
    { label: 'Drifted Points', value: formatDash(c.drift), unit: 'pts' },
    { label: 'Stale Points', value: formatDash(c.stale), unit: 'pts' },
    { label: 'Failed Points', value: formatDash(c.failed), unit: 'pts' },
    { label: 'Control Health %', value: formatPercent(c.healthPct), unit: '' },
    { label: 'Software', value: formatDash(data.current?.softwareVersion), unit: '' },
    { label: 'Recommendations', value: recs == null ? '—' : String(recs), unit: 'items' },
  ];
  return (
    <section className="col-span-12" aria-label="Control software KPIs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <Card key={item.label} {...item} timestamp={`${o20QualityLabel(data)} · ${ts}`} />
        ))}
      </div>
    </section>
  );
}
