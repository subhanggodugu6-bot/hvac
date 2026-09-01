'use client';

import React from 'react';
import {
  EngineeringChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  EngineeringTooltip,
  CHART_COLORS,
} from './EngineeringChart';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { formatDash } from '@/lib/hvac/formatters';

function finite(n: unknown): number | null {
  if (n === null || n === undefined || n === '') return null;
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

function snapshot(rows: { name: string; value: number | null }[]) {
  return rows.filter((r) => r.value !== null) as { name: string; value: number }[];
}

function opp(data: OmDashboardData | null, id: string): OmOpportunity | undefined {
  return data?.opportunities?.find((o) => o.id === id || o.opportunityId === id);
}

export function OMDashboardCharts({ data }: { data: OmDashboardData | null }) {
  const c = data?.charts;
  const o17 = opp(data, 'O17');
  const o18 = opp(data, 'O18');
  const o19 = opp(data, 'O19');
  const o20 = opp(data, 'O20');

  const energy = snapshot([
    { name: 'Actual', value: finite(c?.energyPlanning?.currentKw ?? o17?.energy?.currentKw ?? o17?.current?.kw) },
    { name: 'Baseline', value: finite(c?.energyPlanning?.baselineKw ?? o17?.energy?.baselineKw ?? o17?.current?.baselineKw) },
    { name: 'Target', value: finite(c?.energyPlanning?.targetKw ?? o17?.energy?.targetKw ?? o17?.current?.targetKw) },
  ]);
  const training = snapshot([
    { name: 'Completion %', value: finite(c?.training?.completion ?? o18?.current?.trainingCoveragePct) },
    { name: 'Items', value: finite(c?.training?.items ?? o18?.current?.trainingItems) },
    { name: 'Users', value: finite(c?.training?.affectedUsers ?? o18?.current?.affectedUsers) },
  ]);
  const maint = snapshot([
    { name: 'Health %', value: finite(c?.maintenance?.health ?? o19?.current?.equipmentHealthPct) },
    { name: 'Findings', value: finite(c?.maintenance?.alerts ?? o19?.current?.maintenanceAlerts) },
    { name: 'Loss kW', value: finite(c?.maintenance?.energyLossKw ?? o19?.energy?.impactKw) },
  ]);
  const control = snapshot([
    { name: 'Healthy', value: finite(c?.control?.healthy ?? o20?.current?.healthyPoints) },
    { name: 'Degraded', value: finite(c?.control?.degraded ?? o20?.current?.degradedPoints) },
    { name: 'Overrides', value: finite(c?.control?.overrides ?? o20?.current?.overrides) },
    { name: 'Drift', value: finite(c?.control?.drift ?? o20?.current?.driftCount) },
    { name: 'Critical', value: finite(c?.control?.critical ?? o20?.current?.criticalIssues) },
  ]);

  const panels = [
    { title: 'Energy Planning', data: energy },
    { title: 'Training', data: training },
    { title: 'Maintenance', data: maint },
    { title: 'Control Software', data: control },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {panels.map((p) => (
        <div key={p.title} className="kpi-tile">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{p.title}</div>
          {p.data.length === 0 ? (
            <div className="text-xs font-mono text-amber-800/90">NO DATA</div>
          ) : (
            <EngineeringChart height={180}>
              <BarChart data={p.data}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} />
                <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10 }} width={40} />
                <Tooltip content={<EngineeringTooltip />} />
                <Bar dataKey="value" fill={CHART_COLORS.current} radius={[2, 2, 0, 0]} />
              </BarChart>
            </EngineeringChart>
          )}
          {p.title === 'Maintenance' ? (
            <div className="text-[10px] font-mono text-slate-500 mt-1">PRIORITY {formatDash(c?.maintenance?.priority ?? o19?.priority)}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
