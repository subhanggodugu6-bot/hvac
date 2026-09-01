'use client';

import React from 'react';
import Link from 'next/link';
import { mappingHref, type DashboardOpportunity, type PlantEquipment } from '@/lib/hvac/dashboardHome';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';

function applicableFor(equipmentId: string, opps: DashboardOpportunity[]) {
  const eu = equipmentId.toUpperCase();
  return opps.filter((o) => {
    const id = o.id;
    if (eu.startsWith('AHU')) return ['O3', 'O5', 'O10', 'O11', 'O12'].includes(id);
    if (eu.startsWith('CH') && !eu.startsWith('CW')) return ['O4', 'O7', 'O9', 'O15', 'O16', 'O17', 'O19', 'O20'].includes(id);
    if (eu.startsWith('ZONE')) return ['O1', 'O2', 'O11', 'O12', 'O18'].includes(id);
    if (eu.startsWith('P') && !eu.startsWith('PARK')) return ['O14', 'O6', 'O8'].includes(id);
    if (eu.startsWith('VAV')) return ['O2', 'O5'].includes(id);
    if (eu.startsWith('HHW') || eu.startsWith('HW')) return ['O6'].includes(id);
    if (eu.startsWith('CW')) return ['O8', 'O16'].includes(id);
    return false;
  });
}

function qualityTone(q: string) {
  if (q === 'GOOD') return 'text-emerald-600';
  if (q === 'STALE') return 'text-amber-600';
  if (q === 'BAD') return 'text-pink-600';
  return 'text-slate-500';
}

export function AssetRail({
  selected,
  opportunities,
  telStatus,
  embedded,
}: {
  selected: PlantEquipment | null;
  opportunities: DashboardOpportunity[];
  telStatus?: string;
  embedded?: boolean;
}) {
  const shell = embedded ? 'flex flex-col min-w-0 h-full' : 'card-static p-0 flex flex-col min-w-0 h-full overflow-hidden';

  if (!selected) {
    return (
      <div className={embedded ? shell : 'card-static p-4 h-full min-w-0'}>
        <div className="text-[13px] font-semibold text-slate-800">Selected asset</div>
        <p className="text-[12px] text-slate-500 mt-3">Select a row in Plant layers to inspect canonical points.</p>
      </div>
    );
  }

  const pts = Object.entries(selected.points || {});
  const firstPoint = pts[0]?.[0];
  const applicable = applicableFor(selected.equipment_id, opportunities);

  return (
    <div className={shell}>
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 shrink-0">
        <div>
          <div className="text-[13px] font-semibold text-slate-800">Selected asset</div>
          <div className="font-mono text-[13px] text-violet-700 font-semibold mt-0.5">{selected.equipment_id}</div>
        </div>
        <StatusBadge tone={toneForStatus(telStatus)} pulse={false}>
          {telStatus || 'NO DATA'}
        </StatusBadge>
      </div>

      <div className="overflow-auto eng-scroll flex-1 min-h-0 max-h-[320px]">
        {pts.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-amber-700">NO DATA</p>
        ) : (
          <table className="bms-table min-w-[22rem]">
            <thead>
              <tr>
                <th>Point</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {pts.map(([name, p]) => {
                const q = String(p.quality || '').toUpperCase() || '—';
                const missing = p.value == null || q === 'BAD';
                const shown = missing ? 'NO DATA' : String(p.value);
                return (
                  <tr key={name}>
                    <td className="font-mono text-[11px] text-slate-700 whitespace-nowrap">{name}</td>
                    <td className={`font-mono font-semibold tabular-nums whitespace-nowrap ${qualityTone(q)}`}>{shown}</td>
                    <td className="font-mono text-slate-500 whitespace-nowrap">{p.unit || '—'}</td>
                    <td className="whitespace-nowrap">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${qualityTone(q)}`}>{q || '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 shrink-0 bg-slate-50/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-600">Applicable O&apos;s</span>
            {applicable.length === 0 ? (
              <span className="text-[11px] text-slate-500">None</span>
            ) : (
              applicable.slice(0, 8).map((o) => (
                <Link
                  key={o.id}
                  href={o.href || '/agents'}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
                >
                  {o.id}
                </Link>
              ))
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {applicable[0]?.href ? (
              <Link href={applicable[0].href} className="btn-primary text-[10px] py-1.5 px-3">
                Open studio
              </Link>
            ) : null}
            <Link href={mappingHref(selected.equipment_id, firstPoint)} className="btn-ghost text-[10px] py-1.5 px-3">
              Map point
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssetRailEmpty({ href = '/platform/bms' }: { href?: string }) {
  return (
    <EmptyState
      title="NO DATA"
      detail="Synthetic plant points have not published yet. Map a live BMS or run with HVAC_USE_SIMULATION=1."
      href={href}
      actionLabel="Open Gateway"
    />
  );
}
