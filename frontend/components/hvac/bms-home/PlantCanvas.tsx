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
    <div className={`card-static ${compact ? 'p-3 space-y-2' : 'p-5 space-y-4'}`}>
      <div className="flex items-center justify-between gap-2">
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
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-600 mb-2">{g.title}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {g.rows.map((row) => {
                const tone = (row.tone || 'unmapped') as PlantTone;
                const on = selectedId === row.equipment_id;
                const n = Object.keys(row.points || {}).length;
                return (
                  <button
                    key={row.equipment_id}
                    type="button"
                    onClick={() => onSelect(row)}
                    className={`w-full text-left rounded-2xl border px-3 py-3 flex items-center justify-between gap-2 transition-all ${
                      on
                        ? 'border-violet-400 bg-violet-50 -translate-y-0.5 shadow-md shadow-violet-100'
                        : 'border-slate-150 bg-slate-50/80 hover:border-violet-200 hover:bg-white'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
                      <span className="font-mono text-[12px] text-slate-800 truncate">{row.equipment_id}</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-600">{n} pts</span>
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
