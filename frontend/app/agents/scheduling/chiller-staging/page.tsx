'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchO4Studio, triggerO4Optimize, triggerO4Rollback } from '@/lib/api';
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
  Server,
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
  Snowflake,
  Timer,
  CheckCircle
} from 'lucide-react';

export default function ChillerStagingPage() {
  const queryClient = useQueryClient();
  const [timeRangeHours, setTimeRangeHours] = useState<number>(1);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: studio } = useQuery({
    queryKey: ['o4-studio', timeRangeHours],
    queryFn: () => fetchO4Studio(timeRangeHours),
    refetchInterval: LIVE_POLL_MS,
  });
  const o4State = studio?.state;
  const loadData = studio?.load;
  const chillersData = studio?.chillers;
  const compressorsData = studio?.compressors;
  const stageCandidatesData = studio?.stage_candidates;
  const chwsCandidatesData = studio?.chws_candidates;
  const decisionData = studio?.decision;
  const powerData = studio?.power;
  const safetyData = studio?.safety;
  const bmsActionData = studio?.bms_action;
  const telemetryTrend = studio?.telemetry;
  const plantTrend = studio?.plant_trend;
  const historyData = studio?.history;
  const activitiesData = studio?.activities;

  // Mutations
  const optimizeMutation = useMutation({
    mutationFn: ({ chws, stages }: { chws: number; stages: number }) => triggerO4Optimize(chws, stages),
    onSuccess: (res) => {
      setActionMessage(`Central plant staging & CHWS optimization dispatched: ${res.applied_chws}°C written via BACnet Priority 10`);
      queryClient.invalidateQueries({ queryKey: ['o4-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: () => triggerO4Rollback(),
    onSuccess: (res) => {
      setActionMessage(`Rollback executed: Central plant reverted to ${res.rollback_chws}°C Baseline (1 Chiller)`);
      queryClient.invalidateQueries({ queryKey: ['o4-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const kpis = o4State?.kpis || {};
  const load = loadData || {};
  const safetyPassed = safetyData?.passed_count ?? safetyData?.checks?.filter((c: { status?: string }) => c.status === 'PASS').length;
  const safetyTotal = safetyData?.total_count ?? safetyData?.checks?.length;
  const applyChws = Number(decisionData?.optimal_chws);
  const applyStages = Number(decisionData?.optimal_stage_count ?? 1);

  const chillers = chillersData && chillersData.length > 0 ? chillersData : [];
  const compressors = compressorsData && compressorsData.length > 0 ? compressorsData : [];

  return (
    <OpportunityWorkspace
      def={getOpportunity('O4')!}
      live={provenanceFromAgent(o4State)}
      model={o4State?.model_version}
    >
      <h2 className="sr-only">Chiller & Compressor Staging</h2>

      {actionMessage && <StatusBanner text={actionMessage} type="info" />}

      {/* ========================================================================= */}
      {/* 1. KPI SUMMARY (10 Real-Time Central Plant KPIs) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Cooling Load</span>
          <div className="my-1 text-base font-bold font-mono text-slate-900">{kpis.thermal_cooling_load || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Real Tonnage</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Optimal Stage</span>
          <div className="my-1 text-xs font-bold font-mono text-cyan-800 truncate">{kpis.optimal_stage_count || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.lead_chiller || 'From plant evaluation'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">CHWS Reset</span>
          <div className="my-1 text-sm font-bold font-mono text-cyan-800 truncate">{kpis.chws_reset_setpoint || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.chws_float || 'CHWS reset'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Power Shed</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-700">{kpis.plant_power_reduction_kw || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Chiller Lift</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Efficiency</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-700">{kpis.plant_efficiency || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Centrifugal</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Plant PLR</span>
          <div className="my-1 text-base font-bold font-mono text-purple-700">{kpis.current_plr || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Optimal Band</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Capacity</span>
          <div className="my-1 text-base font-bold font-mono text-sky-700">{kpis.available_capacity || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.capacity_headroom || 'Available capacity'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Stage Status</span>
          <div className="my-1 text-xs font-bold font-mono text-emerald-700 truncate">{kpis.stage_status || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Anti-Cycling</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Comfort</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-700">{kpis.comfort_compliance_pct || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">ASHRAE 55</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Telemetry</span>
          <div className="my-1 text-xs font-bold font-mono text-emerald-700 truncate">{kpis.telemetry_freshness || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">&lt; 30s Limit</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2 & 11. PLANT LOAD OVERVIEW & ANTI-SHORT-CYCLING STATUS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 2. Plant Load Overview */}
        <div className="glass-card p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Snowflake className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Central Plant Cooling Load & Hydraulic Balance
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-800">{load.current_load_tons != null ? `${load.current_load_tons} Tons / ${load.available_capacity_tons ?? '—'} Tons` : 'NO DATA'}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">COOLING LOAD</span>
              <span className="text-base font-bold text-slate-900">{load.current_load_tons != null ? `${load.current_load_tons} Tons` : 'NO DATA'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">AVAILABLE CAPACITY</span>
              <span className="text-base font-bold text-cyan-800">{load.available_capacity_tons != null ? `${load.available_capacity_tons} Tons` : 'NO DATA'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">CAPACITY HEADROOM</span>
              <span className="text-base font-bold text-emerald-700">{load.capacity_headroom_tons != null ? `${load.capacity_headroom_tons} Tons` : 'NO DATA'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">PLANT UTILIZATION</span>
              <span className="text-base font-bold text-purple-700">{load.plant_plr_pct != null ? `${load.plant_plr_pct}%` : 'NO DATA'}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5 p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-500 block">CHWS TEMP</span>
              <span className="text-slate-800 font-bold">{load.chws_temp != null ? `${load.chws_temp}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">CHWR TEMP</span>
              <span className="text-slate-800 font-bold">{load.chwr_temp != null ? `${load.chwr_temp}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">LOOP DELTA-T</span>
              <span className="text-emerald-700 font-bold">{load.delta_t_c != null ? `${load.delta_t_c}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">CHW FLOW RATE</span>
              <span className="text-slate-800 font-bold">{load.flow_lps != null ? `${load.flow_lps} L/s` : 'NO DATA'}</span>
            </div>
          </div>
        </div>

        {/* 11 & 12. Anti-Short-Cycling & Stage-Down Safety */}
        <div className="glass-card p-5 space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Anti-Short-Cycling Timers
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold pill-live font-mono">
              {load.anti_cycling_status || 'NO DATA'}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-800 font-bold block">CH-01 Min Runtime</span>
                <span className="text-[10px] text-slate-600 font-sans">{load.ch01_runtime || 'NO DATA'}</span>
              </div>
              <span className="text-emerald-700 font-bold">{load.ch01_runtime_status || 'NO DATA'}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-800 font-bold block">CH-02 Min Off-Time</span>
                <span className="text-[10px] text-slate-600 font-sans">{load.ch02_off_time || 'NO DATA'}</span>
              </div>
              <span className="text-emerald-700 font-bold">{load.ch02_off_status || 'NO DATA'}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-800 font-bold block">Stage Hysteresis Band</span>
                <span className="text-[10px] text-slate-600 font-sans">{load.stage_hysteresis || 'NO DATA'}</span>
              </div>
              <span className="text-emerald-700 font-bold">{load.stage_hysteresis_status || 'NO DATA'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3 & 4. CHILLER FLEET & COMPRESSOR STAGES TABLES */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 3. Chiller Fleet Status */}
        <div className="glass-card overflow-hidden lg:col-span-2">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Central Plant Chiller Fleet Status
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">2 Centrifugal Chillers</span>
          </div>

          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Capacity</th>
                  <th>Load</th>
                  <th>PLR</th>
                  <th>Power</th>
                  <th>kW/Ton</th>
                  <th>Role</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {chillers.map((ch: any) => (
                  <tr key={ch.chiller_id} className={ch.status === 'RUNNING' ? 'bg-cyan-50' : ''}>
                    <td className="text-slate-900 font-bold">{ch.chiller_id}</td>
                    <td className="font-sans text-slate-800">{ch.name}</td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          ch.status === 'RUNNING'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                            : 'bg-slate-200 border-slate-200 text-slate-400'
                        }`}
                      >
                        {ch.status}
                      </span>
                    </td>
                    <td className="text-slate-700">{ch.capacity_tons} T</td>
                    <td className="text-slate-900 font-bold">{ch.current_load_tons} T</td>
                    <td className="text-purple-700">{ch.plr_pct}%</td>
                    <td className="text-slate-800">{ch.power_kw} kW</td>
                    <td className="text-emerald-700 font-semibold">{ch.efficiency_kw_per_ton > 0 ? `${ch.efficiency_kw_per_ton}` : '—'}</td>
                    <td>
                      <span className="text-cyan-800 font-semibold">{ch.role}</span>
                    </td>
                    <td>
                      <span className="text-emerald-700 font-bold text-[10px]">{ch.stage_decision}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Compressor Stages */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Compressor Stages
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">4 Total Stages</span>
          </div>

          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Chiller</th>
                  <th>Status</th>
                  <th>Load %</th>
                  <th>Power</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {compressors.map((c: any) => (
                  <tr key={c.stage_id} className={c.status === 'RUNNING' ? 'bg-cyan-50' : ''}>
                    <td className="text-slate-900 font-bold">{c.stage_id}</td>
                    <td className="text-slate-400">{c.chiller_id}</td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                          c.status === 'RUNNING'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                            : 'bg-slate-200 border-slate-200 text-slate-400'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="text-slate-800">{c.load_pct}%</td>
                    <td className="text-slate-800">{c.power_kw} kW</td>
                    <td className="text-[10px] text-slate-700 font-sans">{c.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5 & 7. STAGE CANDIDATE & CHWS RESET CANDIDATE EVALUATION */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 5. Stage Candidate Evaluation */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Plant Staging Configuration Candidates
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">1 Chiller vs 2 Chillers</span>
          </div>

          <div className="space-y-3">
            {(stageCandidatesData || []).map((sc: any, i: number) => {
              const isSelected = String(sc.decision || '').includes('SELECTED');
              return (
                <div
                  key={i}
                  className={`p-4 rounded-xl border font-mono space-y-2.5 ${
                    isSelected
                      ? 'bg-cyan-50 border-cyan-400 shadow-md'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 font-sans">{sc.candidate_id}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isSelected
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {sc.decision}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-xs py-1.5 border-y border-slate-200 text-center">
                    <div>
                      <span className="text-[9px] text-slate-500 block">CAPACITY</span>
                      <strong className="text-slate-800">{sc.capacity_tons} T</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">AVG PLR</span>
                      <strong className="text-purple-700">{sc.average_plr_pct}%</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">POWER</span>
                      <strong className="text-slate-900">{sc.predicted_power_kw} kW</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">EFFICIENCY</span>
                      <strong className="text-emerald-700">{sc.efficiency_kw_per_ton} kW/T</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600 font-sans">
                    <span>Power Impact: <strong className={isSelected ? 'text-emerald-700' : 'text-rose-400'}>{sc.power_impact}</strong></span>
                    <span>Anti-Cycling: <strong className="text-emerald-700">{sc.anti_cycling_safety}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 7. CHWS Reset Candidate Evaluation */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                CHWS Reset Candidates (6.5°C – 7.5°C)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600 font-medium">Lift vs Fan Trade-Off</span>
          </div>

          <div className="overflow-x-auto">
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
                {(chwsCandidatesData || []).map((cand: any, i: number) => (
                  <tr key={i} className={cand.decision === 'SELECTED' ? 'bg-cyan-50' : ''}>
                    <td className="font-bold text-cyan-800 text-sm">{cand.candidate_chws != null ? `${Number(cand.candidate_chws).toFixed(1)}°C` : 'NO DATA'}</td>
                    <td className="text-slate-800">{cand.predicted_chiller_power_kw} kW</td>
                    <td className="text-slate-800">{cand.predicted_fan_power_kw} kW</td>
                    <td className="text-slate-900 font-bold">{cand.predicted_plant_power_kw} kW</td>
                    <td className="text-emerald-700 font-semibold">{cand.efficiency_kw_per_ton}</td>
                    <td className="text-slate-700">{cand.power_impact}</td>
                    <td>
                      <span
                        className={
                          cand.safety_status?.startsWith('PASS') ? 'pill-pass' : 'pill-fail'
                        }
                      >
                        {cand.safety_status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          cand.decision === 'SELECTED'
                            ? 'pill-selected'
                            : String(cand.decision || '').startsWith('REJECTED')
                              ? 'pill-fail'
                              : 'pill-muted'
                        }
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
      </div>

      {/* ========================================================================= */}
      {/* 6 & 8. OPTIMAL STAGE DECISION & PLANT EFFICIENCY TRADE-OFF */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 6. Optimal Stage Decision */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O4 Supervisory Central Plant Decision
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded pill-live">
              {decisionData?.decision || 'NO DATA'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-500 block">CURRENT LOAD</span>
              <span className="text-sm font-bold text-slate-700">{decisionData?.current_load_tons != null ? `${decisionData.current_load_tons} Tons` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">OPTIMAL STAGE</span>
              <span className="text-sm font-bold text-cyan-800">{decisionData?.optimal_stage || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">OPTIMAL CHWS</span>
              <span className="text-base font-bold text-emerald-700">{decisionData?.optimal_chws || 'NO DATA'}</span>
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
              <span>Apply Staging & CHWS Reset</span>
            </button>
          </div>
        </div>

        {/* 8. Plant Efficiency & Power Trade-Off */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Plant Efficiency & Power Trade-Off
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-700 font-bold">{powerData?.net_shed_kw != null ? `+${powerData.net_shed_kw} kW Net Shed` : 'NO DATA'}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] text-slate-500 block font-sans">CURRENT</span>
              <div className="flex justify-between"><span>Chiller Power:</span><strong className="text-slate-700">{powerData?.current?.chiller_kw != null ? `${powerData.current.chiller_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Pump Power:</span><strong className="text-slate-700">{powerData?.current?.pump_kw != null ? `${powerData.current.pump_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Fan Power:</span><strong className="text-slate-700">{powerData?.current?.fan_kw != null ? `${powerData.current.fan_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold"><span>Total:</span><span className="text-slate-900">{powerData?.current?.total_kw != null ? `${powerData.current.total_kw} kW` : 'NO DATA'}</span></div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] text-cyan-800 block font-sans">OPTIMIZED</span>
              <div className="flex justify-between"><span>Chiller Power:</span><strong className="text-emerald-700">{powerData?.optimized?.chiller_kw != null ? `${powerData.optimized.chiller_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Pump Power:</span><strong className="text-slate-800">{powerData?.optimized?.pump_kw != null ? `${powerData.optimized.pump_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Fan Power:</span><strong className="text-slate-800">{powerData?.optimized?.fan_kw != null ? `${powerData.optimized.fan_kw} kW` : 'NO DATA'}</strong></div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold"><span>Total:</span><span className="text-cyan-800">{powerData?.optimized?.total_kw != null ? `${powerData.optimized.total_kw} kW` : 'NO DATA'}</span></div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 space-y-1 text-xs font-mono">
            <div className="flex justify-between text-[11px]"><span className="text-slate-600">Chiller Lift Savings:</span><span className="text-emerald-700">{powerData?.delta?.chiller || 'NO DATA'}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-600">Fan Compensation:</span><span className="text-amber-400">{powerData?.delta?.fan || 'NO DATA'}</span></div>
            <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-200"><span className="text-slate-800">Net Power Impact:</span><span className="text-emerald-700">{powerData?.net_shed_kw != null ? `+${powerData.net_shed_kw} kW Net Plant Shed` : 'NO DATA'}</span></div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 9 & 10. COOLING LOAD VS CAPACITY & CENTRAL PLANT LOAD TRENDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 9. Cooling Load vs Plant Capacity */}
        <div className="glass-card p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Cooling Load vs Plant Capacity Margins
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
                <YAxis stroke={CHART_COLORS.axis} fontSize={11} domain={[0, 150]} tickLine={false} unit=" T" />
                <Tooltip content={EngineeringTooltip} />
                <ReferenceLine y={105.0} stroke="#f59e0b" strokeDasharray="3 3" />
                <ReferenceLine y={85.0} stroke="#3b82f6" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="cooling_load_tons" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="Cooling Load (Tons)" />
                <Line type="monotone" dataKey="available_capacity_tons" stroke={CHART_COLORS.optimized} strokeWidth={2} strokeDasharray="2 2" dot={false} name="Available Cap (120T)" />
              </LineChart>
            </EngineeringChart>
          </div>
        </div>

        {/* 10. Central Plant Load & Efficiency */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Central Plant Load & Efficiency Trend
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">kW/Ton Tracking</span>
          </div>

          <div className="pt-4 w-full">
            <EngineeringChart>
              <LineChart data={plantTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
                <YAxis yAxisId="left" stroke={CHART_COLORS.axis} fontSize={11} domain={[30, 60]} tickLine={false} unit=" kW" />
                <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS.axis} fontSize={11} domain={[0.4, 0.8]} tickLine={false} unit=" kW/T" />
                <Tooltip content={EngineeringTooltip} />
                <Line yAxisId="left" type="monotone" dataKey="plant_power_kw" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="Plant Power (kW)" />
                <Line yAxisId="right" type="monotone" dataKey="kw_per_ton" stroke={CHART_COLORS.optimized} strokeWidth={2} dot={false} name="Plant Efficiency (kW/Ton)" />
              </LineChart>
            </EngineeringChart>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 14 & 15. SAFETY VALIDATION & BMS CONTROL ACTION */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 14. Plant Safety Validation */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Central Plant Safety Validation
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
                  <th>Safety Check</th>
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

        {/* 15. BMS Action, Verification & Rollback */}
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
              <span className="text-[10px] text-slate-500 block">ACTION TYPE</span>
              <span className="text-slate-900 font-bold truncate block">{bmsActionData?.action_type || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">PREVIOUS STATE</span>
              <span className="text-slate-400 truncate block">{bmsActionData?.previous_state || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">APPLIED STATE</span>
              <span className="text-cyan-800 font-bold truncate block">{bmsActionData?.applied_state || 'NO DATA'}</span>
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
              <strong>Window:</strong> 15 min · <strong>Expected:</strong> Chiller power reduction · <strong>Actual:</strong> {bmsActionData?.verification?.actual_response || 'NO DATA'}
            </div>
          </div>

          {/* Rollback Trigger Button */}
          <div className="pt-2">
            <button
              onClick={() => rollbackMutation.mutate()}
              className="btn-danger w-full justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rollback Central Plant (1 Chiller / 6.7°C Baseline)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 16. OPTIMIZATION HISTORY & LIVE AGENT ACTIVITY */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Optimization History */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O4 Optimization History
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">Database Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Load</th>
                  <th>Stage</th>
                  <th>CHWS</th>
                  <th>PLR</th>
                  <th>kW/Ton</th>
                  <th>Power</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {(historyData || []).map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="text-slate-400">{h.time}</td>
                    <td className="text-slate-900 font-bold">{h.cooling_load}</td>
                    <td className="text-slate-700">{h.new_stage}</td>
                    <td className="text-cyan-800 font-bold">{h.new_chws}</td>
                    <td className="text-purple-700">{h.plr}</td>
                    <td className="text-emerald-700">{h.kw_per_ton}</td>
                    <td className="text-emerald-700 font-semibold">{h.power_impact}</td>
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
