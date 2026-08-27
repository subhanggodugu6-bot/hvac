'use client';

import type { OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import {
  o19EquipmentRows,
  o19FleetStatus,
  o19OpenCount,
  o19QualityLabel,
  o19SecondsAgo,
} from '@/lib/hvac/o19Format';

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
    <article className="kpi-tile min-h-[110px]" aria-label={label}>
      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-bold font-mono text-slate-900">{value}</span>
        <span className="text-[11px] font-mono text-slate-500">{unit}</span>
      </div>
      <div className="mt-2 text-[10px] font-mono text-slate-500 flex justify-between gap-2">
        <span>{status}</span>
        <span className="truncate">{timestamp}</span>
      </div>
    </article>
  );
}

export function EquipmentMaintenanceKPIGrid({ data }: { data: OmOpportunity }) {
  const ts = o19SecondsAgo(data.telemetry?.lastUpdated || data.timestamp);
  const rows = o19EquipmentRows(data);
  const fleet = o19FleetStatus(data);
  const monitored = rows == null ? null : rows.length;
  const healthy = rows == null ? null : rows.filter((r) => r.status === 'NORMAL').length;
  const monitorN = rows == null ? null : rows.filter((r) => r.status === 'MONITOR').length;
  const maintN = rows == null ? null : rows.filter((r) => r.status === 'MAINTENANCE REQUIRED').length;
  const urgentN = rows == null ? null : rows.filter((r) => r.status === 'URGENT MAINTENANCE').length;
  const open = o19OpenCount(data);
  const items = [
    { label: 'Equipment Health', value: formatPercent(data.current?.equipmentHealthPct), unit: '', status: fleet },
    { label: 'Equipment Monitored', value: monitored == null ? '—' : String(monitored), unit: 'assets', status: fleet },
    { label: 'Healthy Equipment', value: healthy == null ? '—' : String(healthy), unit: 'assets', status: healthy == null ? '—' : 'NORMAL' },
    { label: 'Monitoring Required', value: monitorN == null ? '—' : String(monitorN), unit: 'assets', status: 'MONITOR' },
    { label: 'Maintenance Required', value: maintN == null ? '—' : String(maintN), unit: 'assets', status: 'MAINTENANCE REQUIRED' },
    { label: 'Urgent Maintenance', value: urgentN == null ? '—' : String(urgentN), unit: 'assets', status: 'URGENT' },
    { label: 'Open Maintenance Items', value: open == null ? '—' : String(open), unit: 'items', status: formatDash(data.current?.maintenanceRisk) },
    { label: 'Maintenance Priority', value: formatDash(data.priority), unit: 'rank', status: formatDash(data.current?.maintenanceRisk) },
    { label: 'Data Quality', value: o19QualityLabel(data), unit: 'class', status: o19QualityLabel(data) },
  ];
  return (
    <section className="col-span-12" aria-label="Maintenance KPI grid">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <Card key={item.label} {...item} timestamp={ts} />
        ))}
      </div>
    </section>
  );
}
