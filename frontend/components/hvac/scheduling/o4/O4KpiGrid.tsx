'use client';

import React from 'react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';

const ITEMS: { key: string; label: string; detail: string }[] = [
  { key: 'thermal_cooling_load', label: 'Cooling Load', detail: 'Real tonnage' },
  { key: 'optimal_stage_count', label: 'Optimal Stage', detail: 'Lead chiller' },
  { key: 'chws_reset_setpoint', label: 'CHWS Reset', detail: 'Supply setpoint' },
  { key: 'plant_power_reduction_kw', label: 'Power Shed', detail: 'Chiller lift' },
  { key: 'plant_efficiency', label: 'Efficiency', detail: 'kW / ton' },
  { key: 'current_plr', label: 'Plant PLR', detail: 'Sweet spot' },
  { key: 'available_capacity', label: 'Capacity', detail: 'Headroom' },
  { key: 'stage_status', label: 'Stage Status', detail: 'Anti-cycling' },
  { key: 'comfort_compliance_pct', label: 'Comfort', detail: 'ASHRAE 55' },
  { key: 'telemetry_freshness', label: 'Telemetry', detail: '< 30s limit' },
];

export function O4KpiGrid({ kpis }: { kpis?: Record<string, string | null | undefined> }) {
  const data = kpis || {};
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {ITEMS.map(({ key, label, detail }) => {
        const raw = data[key];
        const missing = raw == null || raw === '';
        const tone = missing ? 'UNKNOWN' : /pass|good|live|simulated/i.test(String(raw)) ? 'PASS' : 'MONITORING';
        return (
          <div key={key} className="kpi-tile min-h-[88px] flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase font-semibold tracking-wider text-slate-500">{label}</span>
              {!missing ? (
                <StatusBadge tone={toneForStatus(tone)} pulse={false}>
                  OK
                </StatusBadge>
              ) : null}
            </div>
            <div className={`font-mono text-sm font-bold truncate ${missing ? 'text-slate-400' : 'text-slate-900'}`}>
              {missing ? '—' : raw}
            </div>
            <span className="text-[9px] text-slate-500">{detail}</span>
          </div>
        );
      })}
    </div>
  );
}
