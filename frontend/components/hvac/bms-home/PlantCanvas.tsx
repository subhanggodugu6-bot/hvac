'use client';

import React from 'react';
import { LAYER_GROUPS, type PlantEquipment, type PlantTone } from '@/lib/hvac/dashboardHome';

const TONE_DOT: Record<PlantTone, string> = {
  good: 'bg-emerald-500',
  stale: 'bg-amber-500',
  bad: 'bg-pink-500',
  missing: 'bg-slate-400',
  unmapped: 'bg-slate-300',
};

export function PlantCanvas({
  layers,
  selectedId,
  onSelect,
  compact,
}: {
  layers?: Record<string, PlantEquipment[]>;
  selectedId?: string | null;
  onSelect: (row: PlantEquipment) => void;
  compact?: boolean;
}) {
  const groups = LAYER_GROUPS.map((g) => ({ ...g, rows: layers?.[g.key] || [] })).filter((g) => g.rows.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className={`card-static ${compact ? 'p-3' : 'p-4'} h-full flex flex-col min-w-0`}>
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <div className="text-[13px] font-semibold text-slate-800">Plant layers</div>
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
          {(['good', 'stale', 'bad', 'unmapped'] as PlantTone[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[t]}`} />
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto eng-scroll pb-1 min-h-0 flex-1">
        {groups.map((g) => (
          <div key={g.key} className="shrink-0 w-[168px]">
            <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-600 mb-2">{g.title}</div>
            <div className="flex flex-col gap-1.5">
              {g.rows.map((row) => {
                const tone = (row.tone || 'unmapped') as PlantTone;
                const on = selectedId === row.equipment_id;
                const n = Object.keys(row.points || {}).length;
                return (
                  <button
                    key={row.equipment_id}
                    type="button"
                    onClick={() => onSelect(row)}
                    className={`w-full text-left rounded-xl border px-2.5 py-2 flex items-center justify-between gap-2 transition-all ${
                      on
                        ? 'border-violet-400 bg-violet-50 shadow-sm shadow-violet-100'
                        : 'border-slate-150 bg-slate-50/80 hover:border-violet-200 hover:bg-white'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
                      <span className="font-mono text-[11px] text-slate-800 truncate">{row.equipment_id}</span>
                    </span>
                    <span className="text-[9px] font-mono text-slate-600">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
