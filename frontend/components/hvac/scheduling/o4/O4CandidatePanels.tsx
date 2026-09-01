'use client';

import React from 'react';
import { Layers, Sliders } from 'lucide-react';
import { PanelSectionHeader } from '@/components/ui/PanelSectionHeader';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';

type StageCandidate = {
  candidate_id?: string;
  decision?: string;
  capacity_tons?: number;
  average_plr_pct?: number;
  predicted_power_kw?: number;
  efficiency_kw_per_ton?: number;
  power_impact?: string;
  anti_cycling_safety?: string;
};

type ChwsCandidate = {
  candidate_chws?: number;
  predicted_chiller_power_kw?: number;
  predicted_fan_power_kw?: number;
  predicted_plant_power_kw?: number;
  efficiency_kw_per_ton?: number;
  power_impact?: string;
  safety_status?: string;
  decision?: string;
};

function decisionTone(decision?: string) {
  const d = String(decision || '').toUpperCase();
  if (d.includes('SELECTED')) return 'pill-selected';
  if (d.includes('REJECTED')) return 'pill-fail';
  return 'pill-muted';
}

export function O4StageCandidates({ rows }: { rows?: StageCandidate[] }) {
  const items = rows || [];
  return (
    <div className="glass-card overflow-hidden h-full flex flex-col">
      <PanelSectionHeader
        title="Plant staging configuration candidates"
        subtitle="1 chiller vs 2 chillers — capacity, PLR, and anti-cycling"
        aside={<Layers className="w-4 h-4 text-cyan-800" aria-hidden />}
      />
      <div className="p-4 space-y-3 flex-1">
        {items.length === 0 ? (
          <TableEmptyState colSpan={1} title="NO CANDIDATES" detail="Stage evaluation has not run yet." />
        ) : (
          items.map((sc, i) => {
            const selected = String(sc.decision || '').includes('SELECTED');
            return (
              <div
                key={sc.candidate_id || i}
                className={`rounded-xl border p-4 font-mono space-y-3 transition-shadow ${
                  selected ? 'border-cyan-400 bg-cyan-50/80 shadow-sm ring-1 ring-cyan-200' : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 font-sans">{sc.candidate_id}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Centrifugal plant staging option</div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${decisionTone(sc.decision)}`}>
                    {sc.decision}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs py-2 border-y border-slate-200/80">
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Capacity</div>
                    <div className="font-bold text-slate-800">{sc.capacity_tons ?? '—'} T</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Avg PLR</div>
                    <div className={`font-bold ${selected ? 'text-purple-700' : 'text-rose-700'}`}>{sc.average_plr_pct ?? '—'}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Power</div>
                    <div className="font-bold text-slate-900">{sc.predicted_power_kw ?? '—'} kW</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Efficiency</div>
                    <div className="font-bold text-emerald-700">{sc.efficiency_kw_per_ton ?? '—'} kW/T</div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-slate-600 font-sans">
                  <span>
                    Power impact:{' '}
                    <strong className={selected ? 'text-emerald-700' : 'text-rose-700'}>{sc.power_impact || '—'}</strong>
                  </span>
                  <span>
                    Anti-cycling: <strong className="text-emerald-700">{sc.anti_cycling_safety || '—'}</strong>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function O4ChwsCandidates({ rows }: { rows?: ChwsCandidate[] }) {
  const items = rows || [];
  return (
    <div className="glass-card overflow-hidden h-full flex flex-col">
      <PanelSectionHeader
        title="CHWS reset candidates (6.5°C – 7.5°C)"
        subtitle="Lift vs fan trade-off across evaluated setpoints"
        aside={<Sliders className="w-4 h-4 text-cyan-800" aria-hidden />}
      />
      <div className="overflow-x-auto eng-scroll flex-1">
        {items.length === 0 ? (
          <div className="p-6">
            <TableEmptyState colSpan={8} title="NO CHWS ROWS" detail="CHWS reset evaluation has not run yet." />
          </div>
        ) : (
          <table className="bms-table">
            <thead>
              <tr>
                <th>CHWS</th>
                <th>Chiller kW</th>
                <th>Fan kW</th>
                <th>Total kW</th>
                <th>kW/Ton</th>
                <th>Impact</th>
                <th>Safety</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {items.map((cand, i) => (
                <tr key={i} className={cand.decision === 'SELECTED' ? 'bg-cyan-50' : undefined}>
                  <td className="font-bold text-cyan-800 whitespace-nowrap">
                    {cand.candidate_chws != null ? `${Number(cand.candidate_chws).toFixed(1)}°C` : '—'}
                  </td>
                  <td>{cand.predicted_chiller_power_kw ?? '—'} kW</td>
                  <td>{cand.predicted_fan_power_kw ?? '—'} kW</td>
                  <td className="font-bold text-slate-900">{cand.predicted_plant_power_kw ?? '—'} kW</td>
                  <td className="text-emerald-700 font-semibold">{cand.efficiency_kw_per_ton ?? '—'}</td>
                  <td className="text-slate-700 max-w-[140px] truncate" title={cand.power_impact || undefined}>
                    {cand.power_impact || '—'}
                  </td>
                  <td>
                    <span className={cand.safety_status?.startsWith('PASS') ? 'pill-pass' : 'pill-fail'}>
                      {cand.safety_status || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={decisionTone(cand.decision)}>{cand.decision || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
