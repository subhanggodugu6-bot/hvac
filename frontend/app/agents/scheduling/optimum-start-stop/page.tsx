'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchO1Studio, triggerO1Optimize, triggerO1Rollback } from '@/lib/api';
import { LIVE_POLL_MS } from '@/lib/hvac/poll';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
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
  Thermometer,
  Timer,
  CheckCircle,
  TrendingUp,
  History,
  Radio
} from 'lucide-react';

export default function OptimumStartStopPage() {
  const queryClient = useQueryClient();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: studio } = useQuery({
    queryKey: ['o1-studio'],
    queryFn: fetchO1Studio,
    refetchInterval: LIVE_POLL_MS,
  });
  const o1State = studio?.state;
  const thermalModelData = studio?.thermal_model;
  const startCandidatesData = studio?.start_candidates;
  const coastCandidatesData = studio?.coast_candidates;
  const decisionData = studio?.decision;
  const timelineData = studio?.timeline;
  const safetyData = studio?.safety;
  const trajectoryData = studio?.trajectory;
  const energyData = studio?.energy;
  const bmsActionData = studio?.bms_action;
  const historyData = studio?.history;
  const activitiesData = studio?.activities;

  // Mutations
  const optimizeMutation = useMutation({
    mutationFn: () => triggerO1Optimize(),
    onSuccess: (res) => {
      setActionMessage(
        res?.status === 'BLOCKED'
          ? `Dispatch blocked: ${res?.message || 'safety validation'}`
          : `Optimum Start/Stop command persisted ${res?.bms_status || 'PENDING'}: start ${res?.optimized_start || 'n/a'} / coast ${res?.optimized_stop || 'n/a'}`
      );
      queryClient.invalidateQueries({ queryKey: ['o1-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: () => triggerO1Rollback(),
    onSuccess: (res) => {
      setActionMessage(`Rollback executed: Reverted to standard 06:00 Start / 18:00 Stop Baseline`);
      queryClient.invalidateQueries({ queryKey: ['o1-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const kpis = o1State?.kpis || {};
  const model = thermalModelData || {};
  const modelNotReady = !thermalModelData || thermalModelData.status === 'MODEL_NOT_READY' || thermalModelData.r2_score == null;
  const startDecision = decisionData?.start || {};
  const coastDecision = decisionData?.coast || {};
  const energyUnavailable = !energyData || energyData.status === 'UNAVAILABLE';
  const verifiedKwh = energyData?.tiers?.verified_savings_kwh;
  const verifiedCost = energyData?.tiers?.verified_cost_usd;
  const safetyPassed = safetyData?.passed_count ?? 0;
  const safetyTotal = safetyData?.total_count ?? 0;

  return (
    <OpportunityWorkspace
      def={getOpportunity('O1')!}
      live={provenanceFromAgent(o1State)}
      model={o1State?.model_version}
      bms={o1State?.bms_connection === 'CONNECTED' ? 'BMS CONNECTED' : 'BMS OFFLINE'}
    >
      <h2 className="sr-only">Optimum Start/Stop Programming</h2>

      {actionMessage && <StatusBanner text={actionMessage} type="info" />}

      {/* ========================================================================= */}
      {/* 1. KPI SUMMARY (12 Real-Time Optimum Start/Stop Metrics) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Start Delay</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-400">{kpis.optimized_start_delay || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.scheduled_start || '—'} → {kpis.optimized_start || 'NO DATA'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Coast Stop</span>
          <div className="my-1 text-base font-bold font-mono text-cyan-400">{kpis.optimized_coast_stop || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.scheduled_stop || '—'} → {kpis.optimized_stop || 'NO DATA'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Runtime Saved</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-400">{kpis.daily_runtime_saved || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">From pipeline (not assumed verified)</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Model Confidence</span>
          <div className="my-1 text-base font-bold font-mono text-purple-400">{kpis.model_confidence || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.thermal_model_status || 'MODEL NOT READY'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Zone Temp</span>
          <div className="my-1 text-base font-bold font-mono text-slate-900">{kpis.current_zone_temp || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Target {kpis.target_temp || 'NO DATA'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Target Reached</span>
          <div className="my-1 text-base font-bold font-mono text-cyan-400">{kpis.predicted_target_reached || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Predicted from model</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Scheduled Window</span>
          <div className="my-1 text-xs font-bold font-mono text-slate-700">
            {kpis.scheduled_start && kpis.scheduled_stop ? `${kpis.scheduled_start} – ${kpis.scheduled_stop}` : 'NO DATA'}
          </div>
          <span className="text-[9px] text-slate-500">Configured baseline</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Occupancy Window</span>
          <div className="my-1 text-xs font-bold font-mono text-cyan-400">{kpis.occupancy_window || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Tenant Schedule</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Optimized Start</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-400">{kpis.optimized_start || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Selected candidate</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Optimized Stop</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-400">{kpis.optimized_stop || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">Passive Drift</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Comfort</span>
          <div className="my-1 text-base font-bold font-mono text-emerald-400">{kpis.comfort_compliance_pct || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">{kpis.comfort_compliance || 'NO DATA'}</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Telemetry</span>
          <div className="my-1 text-xs font-bold font-mono text-emerald-400">{kpis.telemetry_freshness || 'NO DATA'}</div>
          <span className="text-[9px] text-slate-500">&lt; 30s Limit</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2 & 3. THERMAL MODEL & PREDICTIVE PRE-COOLING TRAJECTORY CHART */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 2. Calibrated Thermal Response Model */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Calibrated Thermal Response Model
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">{model.model_version || 'MODEL NOT READY'}</span>
          </div>

          {modelNotReady ? (
            <div className="p-3 text-xs text-slate-400 font-mono">MODEL NOT READY — no evaluated metrics on held-out data.</div>
          ) : (
          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] text-slate-500 block font-sans">MODEL ACCURACY & CALIBRATION</span>
              <div className="flex justify-between"><span>R² Score:</span><strong className="text-emerald-400">{model.r2_score ?? 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Mean Absolute Error:</span><strong className="text-cyan-800">{model.mae_minutes != null ? `${model.mae_minutes} min` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Root Mean Sq Error:</span><strong className="text-slate-700">{model.rmse_minutes != null ? `${model.rmse_minutes} min` : 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Confidence:</span><strong className="text-purple-400">{model.prediction_confidence_pct != null ? `${model.prediction_confidence_pct}%` : 'NO DATA'}</strong></div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] text-slate-500 block font-sans">THERMODYNAMIC PARAMETERS</span>
              <div className="flex justify-between"><span>Pull-Down Rate:</span><strong className="text-slate-800">{model.parameters?.pull_down_rate || 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Weather Sensitivity:</span><strong className="text-slate-800">{model.parameters?.weather_sensitivity || 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Thermal Time Constant:</span><strong className="text-slate-800">{model.parameters?.thermal_time_constant || 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Safety Buffer:</span><strong className="text-emerald-400">{model.parameters?.safety_buffer || 'NO DATA'}</strong></div>
              <div className="flex justify-between"><span>Balance Point Temp:</span><strong className="text-slate-800">{model.parameters?.balance_point_temp || 'NO DATA'}</strong></div>
            </div>
          </div>
          )}
        </div>

        {/* 3. Predictive Pre-Cooling Trajectory Chart */}
        <div className="glass-card p-5 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Pre-Cooling Thermal Response Trajectory
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-sky-400"></span> Actual</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-emerald-400"></span> Predicted</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-400"></span> Target</span>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <EngineeringChart>
              <LineChart data={trajectoryData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
                <YAxis stroke={CHART_COLORS.axis} fontSize={11} domain={[20.5, 25.0]} tickLine={false} unit="°C" />
                <Tooltip content={EngineeringTooltip} />
                {trajectoryData?.length ? (
                  <>
                    <ReferenceLine y={22.5} stroke="#f59e0b" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="actual_temp" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="Actual Temp (°C)" />
                    <Line type="monotone" dataKey="predicted_temp" stroke={CHART_COLORS.optimized} strokeWidth={2} strokeDasharray="2 2" dot={false} name="Predicted Temp (°C)" />
                  </>
                ) : null}
              </LineChart>
            </EngineeringChart>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4 & 5. OPTIMUM START & COAST CANDIDATE EVALUATION TABLES */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 4. Optimum Start Candidates */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Start Time Candidate Evaluation (06:00 – 07:45)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">Target: 08:00 Occupancy</span>
          </div>

          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>Target Reached</th>
                  <th>Pull-Down</th>
                  <th>Energy</th>
                  <th>Risk</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {(startCandidatesData || []).length === 0 ? (
                  <tr><td colSpan={6} className="text-slate-500 text-center py-4">NO DATA</td></tr>
                ) : (startCandidatesData || []).map((c: any, i: number) => (
                  <tr key={i} className={String(c.decision || '').includes('SELECTED') ? 'bg-cyan-50' : ''}>
                    <td className="font-bold text-slate-900 text-sm">{c.candidate_time}</td>
                    <td className="text-cyan-800 font-semibold">{c.predicted_target}</td>
                    <td className="text-slate-700">{c.pulldown_min} min</td>
                    <td className="text-slate-800">{c.energy_kwh} kWh</td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                          String(c.comfort_risk || '').startsWith('LOW') || c.comfort_risk === 'NIL'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : c.comfort_risk === 'MODERATE'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}
                      >
                        {c.comfort_risk || 'NO DATA'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          String(c.decision || '').includes('SELECTED')
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800'
                            : 'bg-slate-200 border-slate-200 text-slate-400'
                        }`}
                      >
                        {c.decision}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Optimum Coast Candidates */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Coast Stop Candidate Evaluation (16:00 – 18:00)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">Limit: ≤ 24.0°C at 18:00</span>
          </div>

          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Stop</th>
                  <th>Temp @ 18:00</th>
                  <th>Saved</th>
                  <th>Energy</th>
                  <th>Safety</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {(coastCandidatesData || []).length === 0 ? (
                  <tr><td colSpan={6} className="text-slate-500 text-center py-4">NO DATA</td></tr>
                ) : (coastCandidatesData || []).map((c: any, i: number) => (
                  <tr key={i} className={String(c.decision || '').includes('SELECTED') ? 'bg-cyan-50' : ''}>
                    <td className="font-bold text-slate-900 text-sm">{c.candidate_time}</td>
                    <td className="text-cyan-800 font-semibold">{c.expected_temp_1800 != null ? `${c.expected_temp_1800}°C` : 'NO DATA'}</td>
                    <td className="text-emerald-400 font-bold">{c.runtime_saved_min != null ? `${c.runtime_saved_min} min` : 'NO DATA'}</td>
                    <td className="text-slate-800">{c.energy_kwh} kWh</td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                          c.safety === 'PASS'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : c.safety === 'WARNING'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}
                      >
                        {c.safety || 'NO DATA'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          String(c.decision || '').includes('SELECTED')
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800'
                            : 'bg-slate-200 border-slate-200 text-slate-400'
                        }`}
                      >
                        {c.decision}
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
      {/* 6 & 7. START/COAST SUPERVISORY DECISIONS & TIMELINE */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 6. Supervisory Decisions Card */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O1 Start & Coast Supervisory Decisions
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">DUAL OPTIMIZATION</span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {/* Start Decision */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-900 font-bold font-sans">Optimum Start Action:</span>
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400 text-cyan-800 text-[10px] font-bold">
                  {startDecision.decision || 'NO DATA'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] py-1 border-y border-slate-200">
                <div><span className="text-[9px] text-slate-500 block">SCHEDULED</span><strong>{startDecision.scheduled_start || 'NO DATA'}</strong></div>
                <div><span className="text-[9px] text-slate-500 block">OPTIMIZED</span><strong className="text-emerald-400">{startDecision.optimized_start || 'NO DATA'}</strong></div>
                <div><span className="text-[9px] text-slate-500 block">TARGET REACH</span><strong className="text-cyan-800">{startDecision.predicted_target_reached || 'NO DATA'}</strong></div>
              </div>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                &ldquo;{decisionData?.start?.reason || 'NO DATA'}&rdquo;
              </p>
            </div>

            {/* Coast Decision */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-900 font-bold font-sans">Optimum Coast Action:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400 text-emerald-800 text-[10px] font-bold">
                  {coastDecision.decision || 'NO DATA'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] py-1 border-y border-slate-200">
                <div><span className="text-[9px] text-slate-500 block">SCHEDULED</span><strong>{coastDecision.scheduled_stop || 'NO DATA'}</strong></div>
                <div><span className="text-[9px] text-slate-500 block">OPTIMIZED</span><strong className="text-emerald-400">{coastDecision.optimized_stop || 'NO DATA'}</strong></div>
                <div><span className="text-[9px] text-slate-500 block">TEMP @ 18:00</span><strong className="text-cyan-800">{coastDecision.predicted_temp_1800 || 'NO DATA'}</strong></div>
              </div>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                &ldquo;{decisionData?.coast?.reason || 'NO DATA'}&rdquo;
              </p>
            </div>
          </div>

          <div className="pt-1">
            <button
              disabled
              title="WRITE_DISABLED — read-only commissioning mode."
              className="btn-primary w-full justify-center opacity-40"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Apply start & coast schedule</span>
            </button>
          </div>
        </div>

        {/* 7. Supervisory Timeline */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O1 Supervisory Daily Schedule Timeline
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">Active Sequence</span>
          </div>

          <div className="space-y-2 font-mono text-xs max-h-72 overflow-y-auto pr-1">
            {(timelineData || []).length === 0 ? (
              <div className="p-3 text-xs text-slate-500 font-mono">NO DATA</div>
            ) : (timelineData || []).map((tl: any, i: number) => (
              <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-cyan-400 font-bold w-12">{tl.time}</span>
                  <div>
                    <span className="text-slate-800 font-sans font-medium block">{tl.event}</span>
                    <span className="text-[10px] text-slate-400 font-sans">{tl.detail}</span>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                    tl.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : tl.status === 'PENDING'
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-800'
                      : 'bg-slate-200 border-slate-200 text-slate-400'
                  }`}
                >
                  {tl.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 8 & 9. SAFETY VALIDATION & BMS ACTION / ROLLBACK */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 8. Safety Validation */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Comfort & Safety Validation
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
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
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        {chk.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 9. BMS Action, Verification & Rollback */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                BMS Command Action & Verification
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400">
              {bmsActionData?.bms_status || 'NO DATA'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-xs text-center p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 block">TARGET POINT</span>
              <span className="text-slate-900 font-bold truncate block">{bmsActionData?.target_equipment || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">PREVIOUS STATE</span>
              <span className="text-slate-400 truncate block">{bmsActionData?.previous_state || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">APPLIED STATE</span>
              <span className="text-cyan-400 font-bold truncate block">{bmsActionData?.applied_state || 'NO DATA'}</span>
            </div>
          </div>

          {/* Verification Box */}
          <div className="p-3.5 rounded-lg bg-slate-100 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Continuous M&V Verification:</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                {bmsActionData?.verification?.status || 'PENDING'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-sans">
              <strong>Window:</strong> 15 min · <strong>Expected:</strong> {startDecision.predicted_target_reached || 'NO DATA'} · <strong>Actual:</strong> {bmsActionData?.verification?.actual_response || 'NO DATA'}
            </div>
          </div>

          {/* Rollback Trigger Button */}
          <div className="pt-2">
            <button
              onClick={() => rollbackMutation.mutate()}
              className="btn-danger w-full justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rollback Schedule (06:00 Start / 18:00 Stop Baseline)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 10. HISTORICAL PRE-COOLING CALIBRATION LOG */}
      {/* ========================================================================= */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Historical Pre-Cooling Calibration Log
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">Database Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="bms-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>OAT</th>
                <th>Initial</th>
                <th>Target</th>
                <th>Scheduled Start</th>
                <th>Opt Start</th>
                <th>Actual Start</th>
                <th>Target Reached</th>
                <th>Pull-Down</th>
                <th>Error</th>
                <th>Coast Stop</th>
                <th>Comfort</th>
                <th>Energy</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {(historyData || []).length === 0 ? (
                <tr><td colSpan={14} className="text-slate-500 text-center py-4">NO DATA</td></tr>
              ) : (historyData || []).map((h: any, i: number) => (
                <tr key={i}>
                  <td className="text-slate-400">{h.date}</td>
                  <td className="text-slate-700">{h.oat}</td>
                  <td className="text-slate-700">{h.initial_temp}</td>
                  <td className="text-cyan-800 font-bold">{h.target_temp}</td>
                  <td className="text-slate-500">{h.scheduled_start}</td>
                  <td className="text-emerald-400 font-bold">{h.optimized_start}</td>
                  <td className="text-slate-800">{h.actual_start}</td>
                  <td className="text-cyan-800 font-semibold">{h.target_reached}</td>
                  <td className="text-slate-700">{h.pulldown_duration}</td>
                  <td className="text-slate-400">{h.prediction_error}</td>
                  <td className="text-cyan-400 font-bold">{h.optimized_stop}</td>
                  <td className="text-emerald-400">{h.comfort}</td>
                  <td className="text-emerald-400 font-semibold">{h.energy_saved}</td>
                  <td>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      {h.verification}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 11 & 12. ENERGY IMPACT & LIVE ACTIVITY STREAM */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 11. Energy Impact */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O1 Energy & Runtime Savings Realization
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-bold">{energyData?.verification_status || 'UNAVAILABLE'}</span>
          </div>

          {energyUnavailable ? (
            <div className="p-3 text-xs text-slate-400 font-mono">NO DATA</div>
          ) : (
          <>
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] text-slate-500 block font-sans">RUNTIME METRICS</span>
              <div className="flex justify-between"><span>Baseline Runtime:</span><strong className="text-slate-700">{energyData.baseline_runtime_hours} hrs</strong></div>
              <div className="flex justify-between"><span>Optimized Runtime:</span><strong className="text-emerald-400">{energyData.optimized_runtime_hours} hrs</strong></div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold"><span>Runtime Saved:</span><span className="text-emerald-400">{energyData.runtime_reduction_hours} hrs ({energyData.runtime_reduction_minutes} min)</span></div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] text-slate-500 block font-sans">ENERGY METRICS</span>
              <div className="flex justify-between"><span>Baseline Energy:</span><strong className="text-slate-700">{energyData.baseline_energy_kwh} kWh</strong></div>
              <div className="flex justify-between"><span>Optimized Energy:</span><strong className="text-cyan-800">{energyData.optimized_energy_kwh} kWh</strong></div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold"><span>Energy Saved:</span><span className="text-emerald-400">{energyData.daily_energy_savings_kwh} kWh / day</span></div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 space-y-1 text-xs font-mono">
            <div className="flex justify-between text-[11px]"><span className="text-slate-400">Predicted Savings:</span><span className="text-slate-700">{energyData.tiers?.predicted_savings_kwh != null ? `${energyData.tiers.predicted_savings_kwh} kWh / day` : 'NO DATA'}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-400">Applied Savings:</span><span className="text-slate-700">{energyData.tiers?.applied_savings_kwh != null ? `${energyData.tiers.applied_savings_kwh} kWh / day` : 'NO DATA'}</span></div>
            <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-200"><span className="text-slate-800">Verified Savings:</span><span className="text-emerald-400">{verifiedKwh != null ? `+${verifiedKwh} kWh / day ($${verifiedCost ?? '—'} / day)` : 'NOT VERIFIED'}</span></div>
          </div>
          </>
          )}
        </div>

        {/* 12. Live Agent Activity Stream */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Live Agent Activity Stream
              </h3>
            </div>
            <span className="flex items-center gap-1 text-xs font-mono text-slate-400">
              {(activitiesData || []).length ? <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> : null}
              <span>{(activitiesData || []).length ? 'Real-time' : 'NO DATA'}</span>
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
                {(activitiesData || []).length === 0 ? (
                  <tr><td colSpan={3} className="text-slate-500 text-center py-4">NO DATA</td></tr>
                ) : (activitiesData || []).slice(0, 8).map((act: any, i: number) => (
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
