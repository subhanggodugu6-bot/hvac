'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchO3Studio, setO3Method, triggerO3Optimize, triggerO3Rollback } from '@/lib/api';
import { LIVE_POLL_MS } from '@/lib/hvac/poll';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import {
  EngineeringChart,
  EngineeringTooltip,
  CHART_COLORS,
} from '@/components/hvac/EngineeringChart';
import { StatusBanner } from '@/components/ui/StatusBanner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Wind,
  Zap,
  TrendingDown,
  ShieldCheck,
  Building,
  Sparkles,
  Cpu,
  Clock,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Activity,
  Gauge,
  Filter,
  Flame,
  Snowflake,
  BarChart3
} from 'lucide-react';

export default function MasterAHUSATPage() {
  const queryClient = useQueryClient();
  const [timeRangeHours, setTimeRangeHours] = useState<number>(1);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: studio } = useQuery({
    queryKey: ['o3-studio', timeRangeHours],
    queryFn: () => fetchO3Studio(timeRangeHours),
    refetchInterval: LIVE_POLL_MS,
  });
  const o3State = studio?.state;
  const zonesData = studio?.zones;
  const demandData = studio?.demand;
  const exclusionsData = studio?.exclusions;
  const candidatesData = studio?.candidates;
  const decisionData = studio?.decision;
  const powerData = studio?.power;
  const safetyData = studio?.safety;
  const bmsActionData = studio?.bms_action;
  const telemetryTrend = studio?.telemetry;
  const zoneResponseTrend = studio?.zone_response;
  const historyData = studio?.history;
  const activitiesData = studio?.activities;

  // Mutations
  const methodMutation = useMutation({
    mutationFn: (method: string) => setO3Method(method),
    onSuccess: (res) => {
      setActionMessage(`Calculation method updated to: ${res.method}`);
      queryClient.invalidateQueries({ queryKey: ['o3-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const optimizeMutation = useMutation({
    mutationFn: (sat: number) => triggerO3Optimize(sat),
    onSuccess: (res) => {
      setActionMessage(`SAT optimization dispatched: ${res.applied_sat}°C written to AHU-01 via BACnet Priority 10`);
      queryClient.invalidateQueries({ queryKey: ['o3-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: () => triggerO3Rollback(),
    onSuccess: (res) => {
      setActionMessage(`Rollback executed: Reverted AHU-01 SAT to ${res.rollback_sat}°C`);
      queryClient.invalidateQueries({ queryKey: ['o3-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const kpis = o3State?.kpis || {};
  const zones = zonesData && zonesData.length > 0 ? zonesData : [];
  const demand = demandData;
  const safetyPassed = safetyData?.passed_count ?? safetyData?.checks?.filter((c: { status?: string }) => c.status === 'PASS').length;
  const safetyTotal = safetyData?.total_count ?? safetyData?.checks?.length;
  const applySat = Number(decisionData?.optimized_sat);

  return (
    <OpportunityWorkspace
      def={getOpportunity('O3')!}
      live={provenanceFromAgent(o3State)}
      model={o3State?.model_version}
    >
      <h2 className="sr-only">Master AHU Supply Air Temperature</h2>

      {actionMessage && <StatusBanner text={actionMessage} type="info" />}

      {/* ========================================================================= */}
      {/* 1. KPI SUMMARY (9 Real-Time Telemetry KPIs) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Current SAT</span>
          <div className="my-1 text-base font-bold font-mono text-slate-900">{kpis.current_sat || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">AHU-01 Sensor</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Optimized SAT</span>
          <div className="my-1 text-base font-bold font-mono text-cyan-800">{kpis.optimized_sat_setpoint || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.sat_trim || 'From evaluation'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Master Demand</span>
          <div className="my-1 text-sm font-bold font-mono text-amber-400 truncate">{kpis.master_demand_basis || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">3rd Highest</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Net HVAC Shed</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-700">{kpis.net_hvac_power_shed_kw || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Total Plant</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Reset Status</span>
          <div className="my-1 text-sm font-bold font-mono text-emerald-700 truncate">{kpis.sat_reset_status || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Trim Loop</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Confidence</span>
          <div className="my-1 text-base font-bold font-mono text-purple-700">{kpis.master_demand_confidence || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Calibrated</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Comfort</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-700">{kpis.comfort_compliance_pct || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">ASHRAE 55</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Zones Included</span>
          <div className="my-1 text-base font-bold font-mono text-sky-700">{kpis.zones_included_ratio || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.zones_excluded || 'Evaluated zones'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Telemetry</span>
          <div className="my-1 text-xs font-bold font-mono text-emerald-700 truncate">{kpis.telemetry_freshness || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">&lt; 30s Limit</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. GUIDELINE 36 DEMAND RANKING & ZONE MATRIX */}
      {/* ========================================================================= */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-800" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Guideline 36 Demand Ranking & Rogue Zone Isolation
              </h3>
              <p className="text-xs text-slate-600 font-sans mt-0.5">
                Full downstream VAV zone cooling & airflow calls driving the Master SAT signal
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-600">8 Downstream Zones</span>
        </div>

        <div className="overflow-x-auto">
          <table className="bms-table">
            <thead>
              <tr>
                <th>Zone ID</th>
                <th>Zone Name</th>
                <th>Temp</th>
                <th>SP</th>
                <th>Error</th>
                <th>Airflow %</th>
                <th>Cooling %</th>
                <th>Calls</th>
                <th>Damper %</th>
                <th>Clg Valve</th>
                <th>Reheat</th>
                <th>Sensor</th>
                <th>Classification</th>
                <th>SAT Inclusion</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {zones.map((z: any) => {
                const isExcluded = z.sat_inclusion === 'EXCLUDED' || z.process_zone === true;
                const isBasis = z.classification === '3RD HIGHEST BASIS';

                return (
                  <tr
                    key={z.zone_id}
                    className={
                      isBasis
                        ? 'bg-cyan-50 font-semibold'
                        : isExcluded
                        ? 'bg-rose-950/20 opacity-80'
                        : ''
                    }
                  >
                    <td className="text-slate-900 font-bold">{z.zone_id}</td>
                    <td className="font-sans text-slate-800">{z.name}</td>
                    <td className="text-slate-900">{z.temperature}°C</td>
                    <td className="text-slate-400">{z.setpoint}°C</td>
                    <td className={z.temp_error > 0.5 ? 'text-amber-400 font-bold' : 'text-slate-700'}>
                      {z.temp_error >= 0 ? `+${z.temp_error}` : z.temp_error}°C
                    </td>
                    <td className="text-slate-800">{z.airflow_demand_pct}%</td>
                    <td className={z.cooling_demand_pct > 50.0 ? 'text-amber-400 font-bold' : 'text-slate-800'}>
                      {z.cooling_demand_pct}%
                    </td>
                    <td className="text-slate-700">{z.cooling_calls}</td>
                    <td className="text-slate-700">{z.damper_position}%</td>
                    <td className="text-slate-700">{z.cooling_valve}%</td>
                    <td className="text-slate-700">{z.reheat_valve}%</td>
                    <td>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold pill-live">
                        {z.sensor_quality}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isBasis
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800'
                            : isExcluded
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : z.classification === 'HIGH DEMAND'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-slate-200 border-slate-200 text-slate-400'
                        }`}
                      >
                        {z.classification}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isExcluded
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                        }`}
                      >
                        {z.sat_inclusion}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3 & 4. MASTER DEMAND CALCULATION & ROGUE ZONE ISOLATION */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 3. Master Demand Calculation Engine */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Master Demand Calculation Engine
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-800">
              Demand: {demand?.master_demand_pct != null ? `${demand.master_demand_pct}%` : 'NO DATA'}
            </span>
          </div>

          {/* Configurable Calculation Method Buttons */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-600 font-sans">Configured Guideline 36 Strategy:</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'THIRD_HIGHEST', label: '3rd Highest Zone' },
                { id: 'PERCENTILE', label: '90th Percentile' },
                { id: 'WEIGHTED', label: 'Airflow Weighted' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => methodMutation.mutate(m.id)}
                  className={`py-2 px-2 text-xs font-mono rounded-lg border transition-all text-center ${
                    demand?.method === m.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-500 block">TOTAL ZONES</span>
              <span className="text-slate-800 font-bold">{demand?.total_zones_count != null ? `${demand.total_zones_count} Zones` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">ELIGIBLE ZONES</span>
              <span className="text-emerald-700 font-bold">{demand?.eligible_zones_count != null ? `${demand.eligible_zones_count} Zones` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">EXCLUDED ZONES</span>
              <span className="text-rose-400 font-bold">{demand?.excluded_zones_count != null ? `${demand.excluded_zones_count}` : 'NO DATA'}</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-sans">Calculated Master Demand:</span>
              <span className="text-cyan-800 font-bold text-sm">{demand?.master_demand_pct != null ? `${demand.master_demand_pct}%` : 'NO DATA'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-sans">Reset Threshold:</span>
              <span className="text-slate-700">{demand?.reset_threshold || 'NO DATA'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-sans">Supervisory Action:</span>
              <span className="text-emerald-700 font-semibold">{demand?.action || 'NO DATA'}</span>
            </div>
          </div>
        </div>

        {/* 4. Rogue / Process Zone Isolation */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Rogue / Process Zone Isolation
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400">
              {exclusionsData?.length ? `${exclusionsData.length} ISOLATED` : 'NONE'}
            </span>
          </div>

          {(exclusionsData || []).length === 0 ? (
            <div className="p-4 text-xs font-mono text-slate-500">NO DATA</div>
          ) : (exclusionsData || []).map((ex: any, i: number) => (
            <div key={i} className="p-4 rounded-xl bg-slate-50 border border-rose-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 font-mono">{ex.zone_id}</span>
                  <span className="text-xs text-slate-700 font-sans ml-2 font-medium">{ex.name}</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono">
                  {ex.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono py-2 border-y border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">Cooling Demand</span>
                  <strong className="text-rose-400">{ex.cooling_demand}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">Zone Temp</span>
                  <strong className="text-slate-800">{ex.temp}</strong>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <div className="text-slate-600 font-sans">
                  <strong className="text-slate-700">Exclusion Rationale:</strong> {ex.reason}
                </div>
                <div className="text-slate-600 font-sans">
                  <strong className="text-emerald-700">Supervisory Impact:</strong> {ex.impact}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. SAT RESET CANDIDATE EVALUATION TABLE */}
      {/* ========================================================================= */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-800" />
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              SAT Reset Candidate Evaluation (12.0°C – 16.0°C)
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-600">Total HVAC Power Minimization</span>
        </div>

        <div className="overflow-x-auto">
          <table className="bms-table">
            <thead>
              <tr>
                <th>Candidate SAT</th>
                <th>Master Demand</th>
                <th>Predicted Comfort</th>
                <th>Fan Power</th>
                <th>Chiller Power</th>
                <th>Reheat Power</th>
                <th>Total Power</th>
                <th>Energy Impact</th>
                <th>Comfort Risk</th>
                <th>Safety</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {(candidatesData || []).map((cand: any, i: number) => (
                <tr key={i} className={cand.decision === 'SELECTED' ? 'bg-cyan-50' : ''}>
                  <td className="font-bold text-cyan-800 text-sm">{cand.candidate_sat != null ? `${Number(cand.candidate_sat).toFixed(1)}°C` : 'NO DATA'}</td>
                  <td className="text-slate-700">{cand.master_demand}</td>
                  <td className="text-slate-800 font-sans">{cand.predicted_comfort}</td>
                  <td className="text-slate-800">{cand.fan_power_kw} kW</td>
                  <td className="text-slate-800">{cand.chiller_power_kw} kW</td>
                  <td className="text-slate-800">{cand.reheat_power_kw} kW</td>
                  <td className="text-slate-900 font-bold">{cand.total_hvac_power_kw} kW</td>
                  <td className="text-emerald-700 font-semibold">{cand.power_impact_kw}</td>
                  <td className={cand.comfort_risk > 0.30 ? 'text-rose-400 font-bold' : 'text-slate-700'}>
                    {cand.comfort_risk != null ? cand.comfort_risk.toFixed(2) : 'NO DATA'}
                  </td>
                  <td>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        cand.safety_status === 'PASS'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {cand.safety_status}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                        cand.decision === 'SELECTED'
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800'
                          : cand.decision === 'REJECTED'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-slate-200 border-slate-200 text-slate-400'
                      }`}
                    >
                      {cand.decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6 & 10. SAT OPTIMIZATION DECISION & HVAC POWER TRADE-OFF */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 6. SAT Optimization Decision */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O3 Supervisory Decision
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded pill-live">
              {decisionData?.decision || 'NO DATA'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-500 block">CURRENT SAT</span>
              <span className="text-sm font-bold text-slate-700">{decisionData?.current_sat != null ? `${decisionData.current_sat}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">OPTIMIZED SAT</span>
              <span className="text-base font-bold text-cyan-800">{decisionData?.optimized_sat != null ? `${decisionData.optimized_sat}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">SAT CHANGE</span>
              <span className="text-sm font-bold text-emerald-700">{decisionData?.sat_change || 'NO DATA'}</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 space-y-2 text-xs">
            <div className="text-slate-600 font-sans">
              <strong className="text-slate-700 block mb-1">Engineering Rationale:</strong>
              &ldquo;{decisionData?.reason || 'NO DATA'}&rdquo;
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 font-mono text-[11px]">
              <span className="text-slate-600">Model: <strong className="text-slate-800">{decisionData?.model_version || 'NO DATA'}</strong></span>
              <span className="text-slate-600">Confidence: <strong className="text-purple-700">{decisionData?.confidence != null ? `${decisionData.confidence}%` : 'NO DATA'}</strong></span>
              <span className="text-slate-600">Safety: <strong className="text-emerald-700">{decisionData?.safety || 'NO DATA'}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled
              title="WRITE_DISABLED — read-only commissioning mode."
              className="btn-primary flex-1 justify-center opacity-40"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Apply Recommended SAT Setpoint</span>
            </button>
          </div>
        </div>

        {/* 10. HVAC Power Trade-Off Model */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                HVAC Power Trade-Off Model
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-700 font-bold">{powerData?.net_shed_kw != null ? `+${powerData.net_shed_kw} kW Net Shed` : 'NO DATA'}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] text-slate-500 block font-sans">CURRENT</span>
              <div className="flex justify-between"><span>Fan Power:</span><strong className="text-slate-700">{powerData?.current?.fan_kw != null ? `${powerData.current.fan_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Chiller Power:</span><strong className="text-slate-700">{powerData?.current?.chiller_kw != null ? `${powerData.current.chiller_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Reheat Power:</span><strong className="text-slate-700">{powerData?.current?.reheat_kw != null ? `${powerData.current.reheat_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold"><span>Total:</span><span className="text-slate-900">{powerData?.current?.total_kw != null ? `${powerData.current.total_kw} kW` : 'NO DATA'}</span></div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] text-cyan-800 block font-sans">OPTIMIZED</span>
              <div className="flex justify-between"><span>Fan Power:</span><strong className="text-slate-800">{powerData?.optimized?.fan_kw != null ? `${powerData.optimized.fan_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Chiller Power:</span><strong className="text-emerald-700">{powerData?.optimized?.chiller_kw != null ? `${powerData.optimized.chiller_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Reheat Power:</span><strong className="text-emerald-700">{powerData?.optimized?.reheat_kw != null ? `${powerData.optimized.reheat_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold"><span>Total:</span><span className="text-cyan-800">{powerData?.optimized?.total_kw != null ? `${powerData.optimized.total_kw} kW` : 'NO DATA'}</span></div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-[11px]"><span className="text-slate-600">Fan Delta:</span><span className="text-amber-400">{powerData?.delta?.fan || 'NO DATA'}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-600">Chiller Delta:</span><span className="text-emerald-700">{powerData?.delta?.chiller || 'NO DATA'}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-600">Reheat Delta:</span><span className="text-emerald-700">{powerData?.delta?.reheat || 'NO DATA'}</span></div>
            <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-200"><span className="text-slate-800">Net Power Impact:</span><span className="text-emerald-700">{powerData?.net_shed_kw != null ? `+${powerData.net_shed_kw} kW Shed` : 'NO DATA'}</span></div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 8 & 9. SAT TREND & DOWNSTREAM ZONE RESPONSE CHARTS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 8. Master SAT & Demand Response Trend */}
        <div className="glass-card p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Master SAT & Demand Response
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {[1, 4, 12, 24].map((hrs) => (
                <button
                  key={hrs}
                  onClick={() => setTimeRangeHours(hrs)}
                  className={`text-xs font-mono px-2 py-0.5 rounded border transition-all ${
                    timeRangeHours === hrs
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-800'
                  }`}
                >
                  {hrs}h
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 w-full">
            <EngineeringChart>
              <LineChart data={telemetryTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
                <YAxis yAxisId="left" stroke={CHART_COLORS.axis} fontSize={11} domain={[12.0, 16.0]} tickLine={false} unit="°C" />
                <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS.axis} fontSize={11} domain={[0, 100]} tickLine={false} unit="%" />
                <Tooltip content={EngineeringTooltip} />
                <ReferenceLine yAxisId="right" y={50.0} stroke="#f59e0b" strokeDasharray="3 3" />
                <Line yAxisId="left" type="monotone" dataKey="actual_sat" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="Actual SAT (°C)" />
                <Line yAxisId="left" type="monotone" dataKey="optimized_sat" stroke={CHART_COLORS.optimized} strokeWidth={2} strokeDasharray="2 2" dot={false} name="Optimized SAT" />
                <Line yAxisId="right" type="monotone" dataKey="master_demand" stroke="#fbbf24" strokeWidth={1.5} dot={false} name="Master Demand (%)" />
              </LineChart>
            </EngineeringChart>
          </div>
        </div>

        {/* 9. Downstream Zone Response */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Downstream Zone Temperature Response
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">Comfort Verification</span>
          </div>

          <div className="pt-4 w-full">
            <EngineeringChart>
              <LineChart data={zoneResponseTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
                <YAxis stroke={CHART_COLORS.axis} fontSize={11} domain={[20.0, 24.5]} tickLine={false} unit="°C" />
                <Tooltip content={EngineeringTooltip} />
                <Line type="monotone" dataKey="vav_101_temp" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="VAV-101 Open Office" />
                <Line type="monotone" dataKey="vav_103_temp" stroke="#f472b6" strokeWidth={1.5} dot={false} name="VAV-103 Conf B" />
                <Line type="monotone" dataKey="vav_104_temp" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="VAV-104 Finance" />
                <Line type="monotone" dataKey="vav_107_server_temp" stroke="#f87171" strokeWidth={1.5} strokeDasharray="2 2" dot={false} name="VAV-107 Server (Isolated)" />
              </LineChart>
            </EngineeringChart>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 11 & 12. SAFETY VALIDATION & BMS CONTROL ACTION */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 11. Comfort & Engineering Safety Validation */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Comfort & Engineering Safety Validation
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded pill-live">
              {safetyTotal ? `${safetyPassed}/${safetyTotal} PASSED` : 'NO DATA'}
            </span>
          </div>

          <div className="overflow-y-auto max-h-56 border border-slate-200 rounded-lg">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Safety Gate Check</th>
                  <th>Value</th>
                  <th>Limit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px]">
                {(safetyData?.checks || []).map((chk: any, i: number) => (
                  <tr key={i}>
                    <td className="font-sans text-slate-800">{chk.name}</td>
                    <td className="text-slate-700">{chk.value}</td>
                    <td className="text-slate-500">{chk.limit}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold pill-live">
                        {chk.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 12, 13 & 14. BMS Action, Verification & Rollback */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                BMS Control Action & Verification
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-700">
              {bmsActionData?.bms_status || 'NO DATA'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-xs text-center p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 block">TARGET POINT</span>
              <span className="text-slate-900 font-bold truncate block">{bmsActionData?.target_point || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">PREVIOUS SAT</span>
              <span className="text-slate-600">{bmsActionData?.previous_sat || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">APPLIED SAT</span>
              <span className="text-cyan-800 font-bold">{bmsActionData?.applied_sat || 'NO DATA'}</span>
            </div>
          </div>

          {/* Verification Box */}
          <div className="p-3.5 rounded-lg bg-slate-100 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Continuous M&V Verification:</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold pill-live">
                {bmsActionData?.verification?.status || 'NO DATA'}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 font-sans">
              <strong>Window:</strong> 15 min · <strong>Expected:</strong> Downstream zones remain comfortable · <strong>Actual:</strong> {bmsActionData?.verification?.actual_response || 'NO DATA'}
            </div>
          </div>

          {/* Rollback Trigger Button */}
          <div className="pt-2">
            <button
              onClick={() => rollbackMutation.mutate()}
              className="btn-danger w-full justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rollback AHU-01 SAT to Baseline (13.2°C)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 15. OPTIMIZATION HISTORY & LIVE AGENT ACTIVITY */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Optimization History */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O3 Optimization History
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">Database Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Prev SAT</th>
                  <th>New SAT</th>
                  <th>Demand</th>
                  <th>Method</th>
                  <th>Power</th>
                  <th>BMS</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {(historyData || []).map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="text-slate-400">{h.time}</td>
                    <td className="text-slate-400">{h.prev_sat}</td>
                    <td className="text-cyan-800 font-bold">{h.new_sat}</td>
                    <td className="text-amber-400">{h.master_demand}</td>
                    <td className="text-slate-700 font-sans">{h.calc_method}</td>
                    <td className="text-emerald-700 font-semibold">{h.predicted_power}</td>
                    <td className="text-sky-800">{h.bms}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold pill-live">
                        {h.verification}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Agent Activity Stream */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Live Agent Activity Stream
              </h3>
            </div>
            <span className="flex items-center gap-1 text-xs font-mono text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Real-time</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead>
                <tr>
                  <th className="w-24">Time</th>
                  <th className="w-48">Event</th>
                  <th>Detail & Telemetry Feedback</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {(activitiesData || []).slice(0, 8).map((act: any, i: number) => (
                  <tr key={i}>
                    <td className="text-slate-400">{act.time}</td>
                    <td className="text-slate-900 font-sans font-medium">{act.event}</td>
                    <td className="text-slate-700 font-sans text-xs">{act.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </OpportunityWorkspace>
  );
}
