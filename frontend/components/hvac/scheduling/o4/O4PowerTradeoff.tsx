'use client';

import { PanelSectionHeader } from '@/components/ui/PanelSectionHeader';
import { Zap } from 'lucide-react';

type PowerBreakdown = {
  chiller_power_kw?: number;
  pump_power_kw?: number;
  fan_power_kw?: number;
  total_plant_power_kw?: number;
  kw_per_ton?: number;
};

type PowerTradeoff = {
  current?: PowerBreakdown;
  optimized?: PowerBreakdown;
  delta?: {
    chiller_kw?: string;
    pump_kw?: string;
    fan_kw?: string;
    net_plant_power_impact_kw?: string;
  };
};

function fmtKw(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'NO DATA';
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(1)} kW` : String(v);
}

function Row({ label, current, optimized }: { label: string; current?: number; optimized?: number }) {
  return (
    <tr>
      <td className="font-sans text-slate-700">{label}</td>
      <td className="font-mono">{fmtKw(current)}</td>
      <td className="font-mono text-emerald-700">{fmtKw(optimized)}</td>
    </tr>
  );
}

export function O4PowerTradeoff({ power }: { power?: PowerTradeoff | null }) {
  const cur = power?.current;
  const opt = power?.optimized;
  const delta = power?.delta;
  const hasData = cur?.total_plant_power_kw != null || opt?.total_plant_power_kw != null;

  return (
    <div className="glass-card overflow-hidden">
      <PanelSectionHeader
        title="Plant efficiency & power trade-off"
        subtitle="Chiller lift vs pump/fan compensation at selected CHWS"
        aside={
          <span className={`text-[10px] font-mono font-bold uppercase ${hasData ? 'text-emerald-700' : 'text-amber-700'}`}>
            {hasData ? 'SIMULATED' : 'NO DATA'}
          </span>
        }
      />
      <div className="p-4">
        <table className="bms-table w-full">
          <thead>
            <tr>
              <th />
              <th>Current</th>
              <th>Optimized</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            <Row label="Chiller power" current={cur?.chiller_power_kw} optimized={opt?.chiller_power_kw} />
            <Row label="Pump power" current={cur?.pump_power_kw} optimized={opt?.pump_power_kw} />
            <Row label="Fan power" current={cur?.fan_power_kw} optimized={opt?.fan_power_kw} />
            <Row label="Total" current={cur?.total_plant_power_kw} optimized={opt?.total_plant_power_kw} />
          </tbody>
        </table>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[9px] text-slate-500 uppercase">Chiller lift savings</div>
            <div className="font-bold text-slate-900 mt-1">{delta?.chiller_kw ?? 'NO DATA'}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[9px] text-slate-500 uppercase">Fan compensation</div>
            <div className="font-bold text-slate-900 mt-1">{delta?.fan_kw ?? 'NO DATA'}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-[9px] text-emerald-800 uppercase flex items-center gap-1">
              <Zap className="w-3 h-3" aria-hidden />
              Net power impact
            </div>
            <div className="font-bold text-emerald-800 mt-1">{delta?.net_plant_power_impact_kw ?? 'NO DATA'}</div>
          </div>
        </div>
        {(cur?.kw_per_ton != null || opt?.kw_per_ton != null) && (
          <div className="mt-3 text-[11px] font-mono text-slate-600 border-t border-slate-200 pt-3">
            Plant efficiency: {cur?.kw_per_ton != null ? `${cur.kw_per_ton} kW/T` : '—'} →{' '}
            {opt?.kw_per_ton != null ? `${opt.kw_per_ton} kW/T` : '—'} optimized
          </div>
        )}
      </div>
    </div>
  );
}
