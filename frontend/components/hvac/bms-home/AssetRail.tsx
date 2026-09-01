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
      <div className="card-static p-4 h-full">
        <div className="text-[13px] font-semibold text-slate-800">Selected asset</div>
        <p className="text-[12px] text-slate-500 mt-3">Select a plant layer to inspect canonical points and applicable opportunities.</p>
      </div>
    );
  }
  const pts = Object.entries(selected.points || {});
  const firstPoint = pts[0]?.[0];
  const applicable = applicableFor(selected.equipment_id, opportunities);

  return (
    <div className="card-static p-4 space-y-4 h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Selected asset</div>
          <div className="font-mono text-lg text-slate-900 mt-1">{selected.equipment_id}</div>
        </div>
        <StatusBadge tone={toneForStatus(telStatus)} pulse={false}>
          {telStatus || 'NO DATA'}
        </StatusBadge>
      </div>
      <div className="space-y-1.5 text-[12px] font-mono">
        {pts.length === 0 ? (
          <div className="text-amber-700">NO DATA</div>
        ) : (
          pts.map(([name, p]) => {
            const q = String(p.quality || '').toUpperCase();
            const shown = p.value == null || q === 'BAD' ? 'NO DATA' : `${p.value}${p.unit ? ` ${p.unit}` : ''}`;
            const color =
              q === 'GOOD' ? 'text-emerald-600' : q === 'STALE' ? 'text-amber-600' : q === 'BAD' ? 'text-pink-600' : 'text-slate-500';
            return (
              <div key={name} className="flex justify-between gap-2">
                <span className="text-slate-600 truncate">{name}</span>
                <span className={color}>{shown}</span>
              </div>
            );
          })
        )}
      </div>
      <div>
        <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-600 mb-2">Applicable O’s</div>
        <div className="flex flex-wrap gap-1.5">
          {applicable.length === 0 ? (
            <span className="text-[11px] text-slate-500">None for this equipment class</span>
          ) : (
            applicable.map((o) => (
              <Link
                key={o.id}
                href={o.href || '/agents'}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700"
              >
                {o.id} {o.applicability || 'Unmapped'}
              </Link>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {applicable[0]?.href ? (
          <Link href={applicable[0].href} className="btn-primary">
            Open studio
          </Link>
        ) : null}
        <Link href={mappingHref(selected.equipment_id, firstPoint)} className="btn-ghost">
          Map point
        </Link>
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
