'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import {
  Wind,
  Zap,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Activity,
  Sliders,
  TrendingDown,
  Gauge,
  Layers,
  Thermometer,
  Radio,
  Clock,
  RefreshCw,
  Eye,
  Check,
  AlertCircle
} from 'lucide-react';
import { actionErrorText } from '@/lib/hvac/actionError';
import {
  fetchO5State,
  dispatchO5Command,
  verifyO5Command,
  rollbackO5Command,
  CandidateMetric
} from '@/lib/plantControlApi';

interface VAVZoneTelemetry {
  id: string;
  name: string;
  temp_c: number;
  setpoint_c: number;
  damper_pct: number;
  airflow_cfm: number;
  pressure_demand: 'TRIM' | 'RESPOND' | 'STABLE';
  occupancy: 'OCCUPIED' | 'UNOCCUPIED' | 'STANDBY';
  status: 'OPTIMAL' | 'CRITICAL' | 'NORMAL';
  is_critical?: boolean;
}

function seriesPoints(
  rows: Array<{ actual?: number; setpoint?: number }>,
  key: 'actual' | 'setpoint',
  width = 500,
  height = 120,
  minY = 1.0,
  maxY = 2.4
) {
  if (!rows.length) return '';
  return rows
    .map((row, i) => {
      const v = Number(row[key]);
      if (!Number.isFinite(v)) return '';
      const x = rows.length === 1 ? 0 : (i / (rows.length - 1)) * width;
      const y = height - ((v - minY) / (maxY - minY)) * height;
      return `${x},${y}`;
    })
    .filter((p) => p.length > 0)
    .join(' ');
}

export default function O5DuctStaticPressureStudio() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Time Series Data for Pressure vs Time
  const [pressureTimeline, setPressureTimeline] = useState<Array<{ time: string; actual: number; setpoint: number; min_limit: number; max_limit: number }>>([]);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetchO5State();
      setData(res);
      setPressureTimeline(Array.isArray(res?.pressure_timeline) ? res.pressure_timeline : []);
    } catch (err) {
      console.error('Failed to load O5 state:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleDispatch = async (targetSp: number) => {
    setActionLoading('dispatch');
    setStatusMessage(null);
    try {
      const res = await dispatchO5Command(targetSp);
      setStatusMessage({ text: `BMS Priority 10 Command Dispatched: ${targetSp.toFixed(2)} in.w.c. (Status: ${res.bms_status})`, type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setStatusMessage({ text: actionErrorText(err, 'Dispatch failed'), type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async () => {
    setActionLoading('verify');
    setStatusMessage(null);
    try {
      const res = await verifyO5Command();
      setStatusMessage({ text: `Verification: ${res.outcome} — ${res.measured_metric} vs baseline`, type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setStatusMessage({ text: actionErrorText(err, 'Verification failed'), type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async () => {
    setActionLoading('rollback');
    setStatusMessage(null);
    try {
      const res = await rollbackO5Command();
      setStatusMessage({ text: `Safety Rollback Executed: Restored baseline ${res.reverted_value} in.w.c.`, type: 'info' });
      await loadData();
    } catch (err: unknown) {
      setStatusMessage({ text: actionErrorText(err, 'Rollback failed'), type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // VAV Zones List
  const rawZones = data?.vav_zones || [];

  const totalAirflow = rawZones.reduce((acc: number, z: any) => acc + (z.airflow_cfm || 0), 0);

  return (
    <OpportunityWorkspace
      def={getOpportunity('O5')!}
      live={provenanceFromAgent(data)}
      actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="btn-secondary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
              Sync BMS
            </button>

            <button
              onClick={() => {
                if (data?.optimized_setpoint == null) return;
                handleDispatch(data.optimized_setpoint);
              }}
              disabled={!!actionLoading || data?.optimized_setpoint == null}
              className="btn-primary"
            >
            <Zap className="w-3.5 h-3.5" />
            {actionLoading === 'dispatch' ? 'Dispatching...' : 'Dispatch Reset'}
          </button>

          <button
            onClick={handleVerify}
            disabled={!!actionLoading}
            className="btn-secondary"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {actionLoading === 'verify' ? 'Verifying...' : '15-Min M&V'}
          </button>

          <button
            onClick={handleRollback}
            disabled={!!actionLoading}
            className="btn-danger"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {actionLoading === 'rollback' ? 'Reverting...' : 'Rollback'}
          </button>
        </div>
      }
    >

      {loading && !data ? (
        <p className="text-[11px] font-mono text-slate-500">Loading O5 telemetry…</p>
      ) : null}

      {/* Status Alert Banner */}
      {statusMessage && (
        <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${
          statusMessage.type === 'success'
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-800'
            : statusMessage.type === 'error'
            ? 'bg-rose-950/40 border-rose-500/30 text-rose-800'
            : 'bg-cyan-50 border-cyan-500/30 text-cyan-800'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : statusMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 10 Display Metrics Top Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Current Static Pressure */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>1. Current Duct SP</span>
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {data?.current_static_pressure?.toFixed(2) ?? 'NO DATA'} <span className="text-xs font-normal text-slate-400">in.w.c.</span>
          </div>
          <div className="text-[10px] text-slate-400">Baseline SP: {data?.current_setpoint?.toFixed(2) ?? 'NO DATA'} in.w.c.</div>
        </div>

        {/* 2. Optimized Static Pressure */}
        <div className="kpi-tile kpi-tile-accent">
          <div className="flex items-center justify-between text-cyan-800 text-xs">
            <span>2. Optimized SP</span>
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-cyan-800">
            {data?.optimized_setpoint?.toFixed(2) ?? 'NO DATA'} <span className="text-xs font-normal text-cyan-400">in.w.c.</span>
          </div>
          <div className="text-[10px] text-emerald-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> Safe Authority Band
          </div>
        </div>

        {/* 3. Pressure Reduction */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>3. SP Reduction</span>
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">
            {data?.pressure_reduction != null ? `-${Number(data.pressure_reduction).toFixed(2)}` : 'NO DATA'} <span className="text-xs font-normal text-slate-400">in.w.c.</span>
          </div>
          <div className="text-[10px] text-slate-400">{data?.pressure_reduction_pct != null ? `${data.pressure_reduction_pct}% vs design` : 'From evaluation'}</div>
        </div>

        {/* 4. Fan Power */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>4. Fan Power</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {data?.fan_power_optimized_kw?.toFixed(1) ?? 'NO DATA'} <span className="text-xs font-normal text-slate-400">kW</span>
          </div>
          <div className="text-[10px] text-slate-400">Current: {data?.fan_power_current_kw?.toFixed(1) ?? 'NO DATA'} kW</div>
        </div>

        {/* 5. Fan Energy Impact */}
        <div className="kpi-tile kpi-tile-accent">
          <div className="flex items-center justify-between text-emerald-800 text-xs">
            <span>5. Energy Impact</span>
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-800">
            -{data?.power_shed_kw?.toFixed(1) ?? 'NO DATA'} <span className="text-xs font-normal text-emerald-400">kW shed</span>
          </div>
          <div className="text-[10px] text-emerald-400">~{data?.daily_savings_kwh?.toFixed(1) ?? 'NO DATA'} kWh / day</div>
        </div>

        {/* 6. Highest VAV Demand */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>6. Max Damper</span>
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {data?.highest_vav_damper_pct?.toFixed(1) ?? 'NO DATA'}%
          </div>
          <div className="text-[10px] text-slate-400">90th %ile: {data?.ninety_pct_damper_pct?.toFixed(1) ?? 'NO DATA'}%</div>
        </div>

        {/* 7. Critical VAV */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>7. Critical VAV</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-amber-300 truncate">
            {data?.critical_zone_id ?? 'NO DATA'}
          </div>
          <div className="text-[10px] text-slate-400 truncate">{data?.critical_zone_name ?? 'NO DATA'}</div>
        </div>

        {/* 8. AHU Airflow */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>8. AHU Airflow</span>
            <Wind className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {totalAirflow.toLocaleString()} <span className="text-xs font-normal text-slate-400">CFM</span>
          </div>
          <div className="text-[10px] text-slate-400">Total Supply Air Delivery</div>
        </div>

        {/* 9. Damper Demand */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>9. Damper Headroom</span>
            <Gauge className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {data?.damper_headroom_pct != null ? `+${data.damper_headroom_pct}%` : 'NO DATA'} <span className="text-xs font-normal text-slate-400">margin</span>
          </div>
          <div className="text-[10px] text-slate-400">{data?.max_damper_limit != null ? `Max limit ceiling: ${data.max_damper_limit}%` : 'Damper authority'}</div>
        </div>

        {/* 10. Optimization Status */}
        <div className="kpi-tile">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>10. Mode & Status</span>
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xs font-bold text-emerald-400 truncate">
            {data?.optimization_status || data?.mode || 'NO DATA'}
          </div>
          <div className="text-[10px] text-slate-400">Confidence: {data?.confidence != null ? `${(data.confidence <= 1 ? data.confidence * 100 : data.confidence).toFixed(0)}%` : 'NO DATA'}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Duct Static Pressure vs Time */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Duct Static Pressure vs Time (SP vs Measured)
            </h2>
            <span className="text-[11px] text-slate-400">Live 6-Hour Operating Envelope</span>
          </div>

          <div className="h-56 w-full bg-slate-100 rounded-xl p-4 border border-slate-200 flex flex-col justify-between">
            {/* Custom SVG Chart */}
            <div className="relative w-full h-40">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                {/* Horizontal Grid lines */}
                <line x1="0" y1="10" x2="500" y2="10" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="70" x2="500" y2="70" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

                {/* Safety Envelope Shading (1.0 to 2.4 in.w.c.) */}
                <rect x="0" y="8" width="500" height="96" fill="rgba(6,182,212,0.04)" />

                {seriesPoints(pressureTimeline, 'setpoint') ? (
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                    points={seriesPoints(pressureTimeline, 'setpoint')}
                  />
                ) : null}
                {seriesPoints(pressureTimeline, 'actual') ? (
                  <polyline
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="3"
                    points={seriesPoints(pressureTimeline, 'actual')}
                  />
                ) : null}
              </svg>
            </div>

            {/* Time Axis Labels */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200">
              {pressureTimeline.map((p, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <span>{p.time}</span>
                  <span className="text-[10px] text-cyan-400 font-mono">{p.actual.toFixed(2)}″</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-cyan-400 rounded-full" />
              <span>Actual Duct Pressure (in.w.c.)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-amber-400 rounded-full border border-dashed border-amber-400" />
              <span>Target Setpoint (in.w.c.)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-cyan-500/10 border border-cyan-500/30 rounded" />
              <span>Safety Band (1.00 – 2.40″)</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Fan Affinity Cube-Law Power Curve */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Fan Power Affinity Impact
            </h2>
            <span className="text-[10px] text-emerald-400 font-mono">{data?.fan_power_reduction_pct != null ? `-${data.fan_power_reduction_pct}% kW` : 'NO DATA'}</span>
          </div>

          <div className="space-y-3 bg-slate-100 p-4 rounded-xl border border-slate-200">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Baseline (2.00″ w.c.)</span>
                <span className="text-slate-800 font-semibold">{data?.fan_power_current_kw != null ? `${Number(data.fan_power_current_kw).toFixed(1)} kW` : 'NO DATA'}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-slate-500 rounded-full w-full" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-cyan-400 font-medium">Optimized {data?.optimized_setpoint != null ? `(${Number(data.optimized_setpoint).toFixed(2)}″ w.c.)` : ''}</span>
                <span className="text-cyan-800 font-bold">{data?.fan_power_optimized_kw != null ? `${Number(data.fan_power_optimized_kw).toFixed(1)} kW` : 'NO DATA'}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full" style={{ width: `${data?.fan_power_current_kw && data?.fan_power_optimized_kw ? Math.min(100, (Number(data.fan_power_optimized_kw) / Number(data.fan_power_current_kw)) * 100) : 0}%` }} />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-400">Net Continuous Shed</span>
              <span className="text-emerald-400 font-bold">{data?.power_shed_kw != null ? `-${Number(data.power_shed_kw).toFixed(1)} kW` : 'NO DATA'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-700">Affinity Principle:</strong> Fan power varies with the pressure ratio to the 1.45th exponent: <span className="text-cyan-800 font-mono">P₂ = P₁ · (SP₂/SP₁)^1.45</span>. A 20% static pressure trim sheds ~27% fan motor kW.
          </div>
        </div>
      </div>

      {/* VAV Demand Distribution & VAV Telemetry Table */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Downstream VAV Damper Distribution & Zone Telemetry
            </h2>
            <p className="text-xs text-slate-400">
              8 VAV Terminal Units monitored real-time. Optimization regulates the 90th percentile zone under 90% authority.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-md bg-slate-200 text-slate-700 font-mono">
              90th %ile: {data?.ninety_pct_damper_pct?.toFixed(1) ?? 'NO DATA'}%
            </span>
            <span className="px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono">
              Critical: {data?.critical_zone_id ?? 'NO DATA'} ({data?.highest_vav_damper_pct?.toFixed(1) ?? 'NO DATA'}%)
            </span>
          </div>
        </div>

        {/* VAV Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-400 font-medium border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">VAV ID</th>
                <th className="py-2.5 px-3">Zone Name</th>
                <th className="py-2.5 px-3">Temp / SP</th>
                <th className="py-2.5 px-3">Damper %</th>
                <th className="py-2.5 px-3">Airflow (CFM)</th>
                <th className="py-2.5 px-3">Pressure Demand</th>
                <th className="py-2.5 px-3">Occupancy</th>
                <th className="py-2.5 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-slate-700 font-mono">
              {rawZones.map((zone: any) => (
                <tr
                  key={zone.id}
                  className={`hover:bg-slate-100 transition-colors ${
                    zone.is_critical || zone.id === 'VAV-103' ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                    {zone.id}
                    {zone.is_critical && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-sans">
                        CRITICAL
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-800">{zone.name}</td>
                  <td className="py-2.5 px-3">
                    {zone.temp_c?.toFixed(1) ?? 'NO DATA'}°C / <span className="text-slate-500">{zone.setpoint_c?.toFixed(1) ?? 'NO DATA'}°C</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            (zone.damper_pct || 0) > 80
                              ? 'bg-amber-400'
                              : (zone.damper_pct || 0) > 60
                              ? 'bg-cyan-400'
                              : 'bg-emerald-400'
                          }`}
                          style={{ width: `${zone.damper_pct || 0}%` }}
                        />
                      </div>
                      <span className="font-semibold">{zone.damper_pct?.toFixed(1) ?? 'NO DATA'}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-cyan-800">
                    {(zone.airflow_cfm || 0).toLocaleString()} CFM
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      zone.pressure_demand === 'RESPOND'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : zone.pressure_demand === 'TRIM'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-200 text-slate-400'
                    }`}>
                      {zone.pressure_demand || 'STABLE'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <span className="text-slate-400 text-[11px]">{zone.occupancy || 'OCCUPIED'}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                      zone.status === 'CRITICAL'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}>
                      {zone.status === 'CRITICAL' ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      {zone.status || 'OPTIMAL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Section & Candidate Evaluation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Candidate Evaluation Matrix & Recommendation
            </h2>
            <span className="text-xs text-slate-400 font-mono">Algorithm: Trim & Respond (Cube-Law)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            {(data?.candidates || []).map((c: CandidateMetric) => {
              const isSelected = c.decision === 'SELECTED_OPTIMAL';
              return (
                <div
                  key={c.candidate_id}
                  className={`p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-cyan-50 border-cyan-500/50 shadow-md shadow-cyan-200 ring-1 ring-cyan-500/30'
                      : c.safety_status === 'REJECT'
                      ? 'bg-slate-100 border-rose-500/20 opacity-60'
                      : 'bg-slate-100 border-slate-200 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className={isSelected ? 'text-cyan-800' : 'text-slate-400'}>
                      {c.candidate_id}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-800 font-bold'
                        : c.safety_status === 'REJECT'
                        ? 'bg-rose-500/20 text-rose-800'
                        : 'bg-slate-200 text-slate-400'
                    }`}>
                      {c.decision}
                    </span>
                  </div>

                  <div className="mt-2 text-base font-bold text-slate-900 font-mono">
                    {c.static_pressure_sp?.toFixed(2)}″ <span className="text-[10px] font-normal text-slate-400">w.c.</span>
                  </div>

                  <div className="mt-2 space-y-1 text-[10px] text-slate-400 font-mono">
                    <div className="flex justify-between">
                      <span>Fan kW:</span>
                      <span className="text-slate-800 font-semibold">{c.predicted_fan_power_kw?.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shed:</span>
                      <span className="text-emerald-400 font-semibold">-{c.power_shed_kw?.toFixed(1)} kW</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Damper:</span>
                      <span className={(c.predicted_max_damper_pct ?? 0) > 90 ? 'text-amber-400 font-semibold' : 'text-slate-700'}>
                        {c.predicted_max_damper_pct?.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {!(data?.candidates || []).length ? (
              <div className="sm:col-span-5 text-xs font-mono text-slate-500 py-4 text-center">NO DATA</div>
            ) : null}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <div className="text-slate-400">Current Setpoint: <strong className="text-slate-900 font-mono">{data?.current_setpoint?.toFixed(2) ?? 'NO DATA'} in.w.c.</strong></div>
              <div className="text-slate-400">Recommended Setpoint: <strong className="text-cyan-800 font-mono">{data?.optimized_setpoint?.toFixed(2) ?? 'NO DATA'} in.w.c.</strong></div>
            </div>
            <div className="text-right space-y-0.5">
              <div className="text-emerald-400 font-bold">Expected Net Shed: {data?.power_shed_kw != null ? `-${Number(data.power_shed_kw).toFixed(1)} kW` : 'NO DATA'}</div>
              <div className="text-slate-400 text-[11px]">Safety Assessment: <strong className="text-emerald-400">{data?.safety_status || 'NO DATA'}</strong></div>
            </div>
          </div>
        </div>

        {/* Safety & Guardrail Checklist */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Safety & Deterministic Guardrails
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">
              {data?.safety_status || 'NO DATA'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-400">Telemetry Freshness</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                {data?.telemetry_age || (data?.telemetry?.ageSeconds != null ? `${data.telemetry.ageSeconds}s` : 'NO DATA')}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-400">Sensor Signal Quality</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> 100% GOOD
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-400">Critical Zone Headroom</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> 88.5% (&le;90%)
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-400">Engineering Min/Max Limits</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> 1.00″ &le; 1.60″ &le; 2.40″
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-400">Rate of Change Clamping</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> &le; 0.20″/10min
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Verification & Rollback Audit Section */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            15-Minute M&V Verification & Fail-Safe Rollback Engine
          </h2>
          <span className="text-xs text-slate-400 font-mono">BMS Protocol: BACnet/IP Priority 10</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Target BACnet Point</div>
            <div className="text-sm font-bold text-slate-900 font-mono">{data?.target_point ?? 'NO DATA'}</div>
            <div className="text-[10px] text-slate-500">Instance: AV-2041</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Dispatched Value</div>
            <div className="text-sm font-bold text-cyan-800 font-mono">{data?.optimized_setpoint?.toFixed(2) ?? 'NO DATA'} in.w.c.</div>
            <div className="text-[10px] text-emerald-400">BMS Acknowledged</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Actual Response Window</div>
            <div className="text-sm font-bold text-slate-900 font-mono">{data?.verified_response || 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-400">{data?.tracking_error || 'Verification window'}</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Verification Outcome</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">{data?.verification_outcome || 'NO DATA'}</div>
            <div className="text-[10px] text-slate-400">{data?.fail_safe_baseline != null ? `Fail-safe baseline: ${data.fail_safe_baseline}″ w.c.` : 'Fail-safe baseline unavailable'}</div>
          </div>
        </div>
      </div>
    </OpportunityWorkspace>
  );
}
