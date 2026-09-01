'use client';

import React, { useMemo } from 'react';
import { LAYER_GROUPS, type PlantEquipment, type PlantTone } from '@/lib/hvac/dashboardHome';

const TONE_DOT: Record<PlantTone, string> = {
  good: 'bg-emerald-500',
  stale: 'bg-amber-500',
  bad: 'bg-pink-500',
  missing: 'bg-slate-400',
  unmapped: 'bg-slate-300',
};

const TONE_LABEL: Record<PlantTone, string> = {
  good: 'Good',
  stale: 'Stale',
  bad: 'Bad',
  missing: 'Missing',
  unmapped: 'Unmapped',
};

type FlatRow = { layer: string; layerKey: string; equipment: PlantEquipment };

export function PlantCanvas({
  layers,
  selectedId,
  onSelect,
  compact,
  embedded,
}: {
  layers?: Record<string, PlantEquipment[]>;
  selectedId?: string | null;
  onSelect: (row: PlantEquipment) => void;
  compact?: boolean;
  embedded?: boolean;
}) {
  const flatRows = useMemo(() => {
    const out: FlatRow[] = [];
    for (const g of LAYER_GROUPS) {
      for (const row of layers?.[g.key] || []) {
        out.push({ layer: g.title, layerKey: g.key, equipment: row });
      }
    }
    return out;
  }, [layers]);

  if (flatRows.length === 0) return null;

  const shell = embedded ? 'flex flex-col min-w-0 h-full' : `card-static ${compact ? 'p-0' : 'p-0'} flex flex-col min-w-0 h-full overflow-hidden`;

  return (
    <div className={shell}>
      <div className={`flex items-center justify-between gap-2 border-b border-slate-100 shrink-0 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
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
      <div className={`overflow-auto eng-scroll flex-1 min-h-0 ${compact ? 'max-h-[240px]' : 'max-h-[380px]'}`}>
        <table className="bms-table min-w-[20rem]">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Equipment</th>
              <th>Status</th>
              <th className="text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map(({ layer, layerKey, equipment }) => {
              const tone = (equipment.tone || 'unmapped') as PlantTone;
              const on = selectedId === equipment.equipment_id;
              const n = Object.keys(equipment.points || {}).length;
              return (
                <tr
                  key={`${layerKey}-${equipment.equipment_id}`}
                  onClick={() => onSelect(equipment)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(equipment);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={`cursor-pointer transition-colors ${on ? 'bg-violet-50/90' : ''}`}
                >
                  <td className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">{layer}</td>
                  <td className="font-mono font-semibold text-slate-800 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
                      {equipment.equipment_id}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{TONE_LABEL[tone]}</span>
                  </td>
                  <td className="text-right font-mono text-slate-600 tabular-nums">{n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
