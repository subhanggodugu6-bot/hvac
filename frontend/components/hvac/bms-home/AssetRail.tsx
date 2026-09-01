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

export function AssetRail({
  selected,
  opportunities,
  telStatus,
}: {
  selected: PlantEquipment | null;
  opportunities: DashboardOpportunity[];
  telStatus?: string;
}) {
  if (!selected) {
    return (
      <div className="card-static p-4 h-full min-w-0">
        <div className="text-[13px] font-semibold text-slate-800">Selected asset</div>
        <p className="text-[12px] text-slate-500 mt-3">Select a plant layer to inspect canonical points and applicable opportunities.</p>
      </div>
    );
  }
  const pts = Object.entries(selected.points || {});
  const firstPoint = pts[0]?.[0];
  const applicable = applicableFor(selected.equipment_id, opportunities);

  return (
    <div className="card-static p-4 h-full flex flex-col min-w-0">
      <div className="flex items-start justify-between gap-2 mb-3 shrink-0">
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Selected asset</div>
          <div className="font-mono text-base text-slate-900 mt-0.5">{selected.equipment_id}</div>
        </div>
        <StatusBadge tone={toneForStatus(telStatus)} pulse={false}>
          {telStatus || 'NO DATA'}
        </StatusBadge>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto eng-scroll">
        {pts.length === 0 ? (
          <div className="text-amber-700 text-[12px]">NO DATA</div>
        ) : (
          <div className="flex flex-wrap gap-2 min-w-max pb-1">
            {pts.map(([name, p]) => {
              const q = String(p.quality || '').toUpperCase();
              const shown = p.value == null || q === 'BAD' ? 'NO DATA' : `${p.value}${p.unit ? ` ${p.unit}` : ''}`;
              const color =
                q === 'GOOD' ? 'text-emerald-600' : q === 'STALE' ? 'text-amber-600' : q === 'BAD' ? 'text-pink-600' : 'text-slate-500';
              return (
                <div
                  key={name}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2 min-w-[108px] max-w-[140px]"
                >
                  <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide truncate">{name}</div>
                  <div className={`text-[12px] font-mono font-semibold mt-0.5 truncate ${color}`}>{shown}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-600 mr-1">O&apos;s</span>
            {applicable.length === 0 ? (
              <span className="text-[11px] text-slate-500">None</span>
            ) : (
              applicable.slice(0, 6).map((o) => (
                <Link
                  key={o.id}
                  href={o.href || '/agents'}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700"
                >
                  {o.id}
                </Link>
              ))
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {applicable[0]?.href ? (
              <Link href={applicable[0].href} className="btn-primary text-[10px] py-1.5 px-3">
                Studio
              </Link>
            ) : null}
            <Link href={mappingHref(selected.equipment_id, firstPoint)} className="btn-ghost text-[10px] py-1.5 px-3">
              Map
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
