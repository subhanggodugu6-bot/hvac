'use client';

import React from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TelemetryPoint, SupervisoryCycleResponse } from '@/lib/types';
import { EmptyState } from '@/components/hvac/EmptyState';
import {
  EngineeringChart,
  EngineeringTooltip,
  CHART_COLORS,
} from '@/components/hvac/EngineeringChart';

interface TemperatureChartProps {
  data?: TelemetryPoint[] | SupervisoryCycleResponse;
}

export const TemperatureChart: React.FC<TemperatureChartProps> = ({ data }) => {
  const chartData: TelemetryPoint[] = Array.isArray(data) ? data : [];

  return (
    <div className="glass-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Building electrical power profile (kW)</h3>
          <p className="text-xs text-slate-500 mt-0.5">Baseline vs optimized power when telemetry is available</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-full bg-slate-500" />
            <span className="text-slate-600">Baseline kW</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-full bg-cyan-400" />
            <span className="text-cyan-800 font-medium">Optimized kW</span>
          </div>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="pt-4">
          <EmptyState title="NO POWER SERIES" detail="Baseline and optimized kW are not available in the latest cycle." />
        </div>
      ) : (
        <div className="pt-4">
          <EngineeringChart>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
              <YAxis stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} unit=" kW" />
              <Tooltip content={EngineeringTooltip} />
              <Line type="monotone" dataKey="baseline_kw" stroke={CHART_COLORS.baseline} strokeWidth={2} dot={false} name="Baseline kW" />
              <Area type="monotone" dataKey="optimized_kw" stroke={CHART_COLORS.current} strokeWidth={2} fillOpacity={0.15} fill={CHART_COLORS.current} name="Optimized kW" />
            </AreaChart>
          </EngineeringChart>
        </div>
      )}
    </div>
  );
};
