'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { actionErrorText } from '@/lib/hvac/actionError';
import { apiJson } from '@/lib/api/client';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Thermometer,
  Flame,
  Droplets,
  Gauge,
  Zap,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Activity,
  Sliders,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Layers,
  Settings,
  Clock,
  ChevronRight,
  Info
} from 'lucide-react';

type ResetMode = 'HHW' | 'CHW' | 'CW';

function TemperatureResetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode = (searchParams.get('mode')?.toUpperCase() as ResetMode) || 'CHW';

  const [activeMode, setActiveMode] = useState<ResetMode>(
    ['HHW', 'CHW', 'CW'].includes(initialMode) ? initialMode : 'CHW'
  );
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch telemetry & optimization state on mode switch
  const fetchState = async (mode: ResetMode) => {
    try {
      setLoading(true);
      const json = await apiJson(`/agents/plant-control/o6-8/state?mode=${mode}`);
      setData(json);
    } catch (err) {
      console.error('Failed to fetch temperature reset state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const m = searchParams.get('mode')?.toUpperCase();
    if (m === 'HHW' || m === 'CHW' || m === 'CW') {
      setActiveMode(m);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchState(activeMode);
  }, [activeMode]);

  const selectMode = (mode: ResetMode) => {
    setActiveMode(mode);
    router.replace(`/agents/plant-control/temperature-reset?mode=${mode}`, { scroll: false });
  };

  const handleDispatch = async () => {
    if (!data) return;
    setDispatchStatus('DISPATCHING');
    setActionError(null);
    try {
      await apiJson('/agents/plant-control/o6-8/command', {
        method: 'POST',
        body: JSON.stringify({
          target_setpoint: data.optimized_setpoint,
          reset_type: activeMode
        })
      });
      setDispatchStatus('ACKNOWLEDGED');
      setTimeout(() => setDispatchStatus(null), 4000);
    } catch (e) {
      setDispatchStatus('FAILED');
      setActionError(actionErrorText(e, 'Dispatch failed'));
    }
  };

  const handleVerify = async () => {
    setVerifyStatus('RUNNING');
    setActionError(null);
    try {
      await apiJson(`/agents/plant-control/o6-8/verify?mode=${activeMode}`, {
        method: 'POST'
      });
      setVerifyStatus('VERIFIED');
      setTimeout(() => setVerifyStatus(null), 4000);
    } catch (e) {
      setVerifyStatus('FAILED');
      setActionError(actionErrorText(e, 'Verification failed'));
    }
  };

  const handleRollback = async () => {
    setActionError(null);
    try {
      await apiJson(`/agents/plant-control/o6-8/rollback?mode=${activeMode}`, {
        method: 'POST'
      });
      fetchState(activeMode);
    } catch (e) {
      setActionError(actionErrorText(e, 'Rollback failed'));
    }
  };

  const modeMeta: Record<ResetMode, { number: string; name: string; description: string }> = {
    HHW: {
      number: '6',
      name: 'Heating Hot Water Reset',
      description: 'Lowest HHW flow temperature that still meets heating demand; boost only at peak.',
    },
    CHW: {
      number: '7',
      name: 'Chilled Water Reset',
      description: 'Raise CHW supply temperature in mild weather without losing dehumidification when it matters.',
    },
    CW: {
      number: '8',
      name: 'Condenser Water Reset',
      description: 'Track wet-bulb with tower approach so CW is not held at a constant high temperature.',
    },
  };
  const crumbOpp = modeMeta[activeMode];
  const resetDef = getOpportunity('O6-O8')!;

  return (
    <OpportunityWorkspace
      def={{
        ...resetDef,
        id: `O${crumbOpp.number}`,
        title: crumbOpp.name,
        description: crumbOpp.description,
      }}
      live={provenanceFromAgent(data)}
      actions={
        <button
          onClick={handleRollback}
          className="btn-danger"
          title="Rollback to design baseline setpoint"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Fail-Safe Rollback
        </button>
      }
    >

      <div className="grid grid-cols-3 border border-slate-200 rounded-lg bg-[#0d1524] p-0.5">
        {(
          [
            { mode: 'HHW' as const, label: 'O6 Heating Hot Water' },
            { mode: 'CHW' as const, label: 'O7 Chilled Water' },
            { mode: 'CW' as const, label: 'O8 Condenser Water' },
          ]
        ).map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => selectMode(mode)}
            className={`py-2.5 px-2 text-[11px] font-semibold tracking-wide ${
              activeMode === mode
                ? 'bg-cyan-500/15 text-cyan-800 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Current Setpoint */}
        <div className="kpi-tile relative overflow-hidden">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Current Setpoint</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
            {data?.current_setpoint != null ? `${data.current_setpoint} °C` : 'NO DATA'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            Design Baseline: {data?.baseline_setpoint != null ? `${data.baseline_setpoint} °C` : 'NO DATA'}
          </div>
        </div>

        {/* Optimized Setpoint */}
        <div className="kpi-tile kpi-tile-accent">
          <div className="text-[11px] font-mono text-cyan-800 uppercase tracking-wider flex items-center justify-between">
            <span>Optimized Reset</span>
            <Sparkles className="w-3.5 h-3.5 text-cyan-800" />
          </div>
          <div className="text-2xl font-bold text-cyan-800 mt-1 font-mono">
            {data?.optimized_setpoint != null ? `${data.optimized_setpoint} °C` : 'NO DATA'}
          </div>
          <div className="text-[10px] text-violet-700 mt-1 font-mono flex items-center gap-1">
            {Number(data?.temperature_reduction) > 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : Number(data?.temperature_reduction) < 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : null}
            Delta: {data?.temperature_reduction != null ? `${data.temperature_reduction} °C` : 'NO DATA'}
          </div>
        </div>

        {/* Demand / Load */}
        <div className="kpi-tile relative overflow-hidden">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Current Load / Demand</div>
          <div className="text-lg font-bold text-slate-900 mt-1.5 font-mono truncate">
            {data?.demand_load || 'NO DATA'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono truncate">
            {data?.outdoor_condition || 'NO DATA'}
          </div>
        </div>

        {/* Power / Efficiency Impact */}
        <div className="kpi-tile relative overflow-hidden">
          <div className="text-[11px] font-mono text-emerald-700 uppercase tracking-wider flex items-center justify-between">
            <span>Power & Efficiency</span>
            <Zap className="w-3.5 h-3.5 text-emerald-700" />
          </div>
          <div className="text-lg font-bold text-emerald-800 mt-1.5 font-mono">
            {data?.power_impact || 'NO DATA'}
          </div>
          <div className="text-[10px] text-emerald-700/80 mt-1 font-mono truncate">
            {data?.efficiency_impact || 'NO DATA'}
          </div>
        </div>
      </div>

      {/* CENTER GRID: RESET CURVE VISUALIZATION & DECISION ENGINE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Reset Curve SVG */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-800" />
                  {activeMode === 'HHW' && 'Condensing Boiler Outdoor Temperature Reset Curve'}
                  {activeMode === 'CHW' && 'Chilled Water Lift Reduction vs Pump Penalty Curve'}
                  {activeMode === 'CW' && 'Cooling Tower Convex Power Optimization Surface'}
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
                  {data ? data.target_point : 'Target Loop Controller Point'}
                </p>
              </div>
              <div className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-800 text-xs font-mono">
                {data?.daily_kwh_savings != null ? `${data.daily_kwh_savings} kWh/day` : 'NO DATA'}
              </div>
            </div>

            {/* SVG Visualizer */}
            <div className="h-60 w-full bg-slate-100 rounded-xl border border-slate-200 p-4 flex flex-col justify-between relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 180">
                {/* Grid Lines */}
                <line x1="40" y1="20" x2="480" y2="20" stroke="#334155" strokeDasharray="3 3" opacity="0.3" />
                <line x1="40" y1="70" x2="480" y2="70" stroke="#334155" strokeDasharray="3 3" opacity="0.3" />
                <line x1="40" y1="120" x2="480" y2="120" stroke="#334155" strokeDasharray="3 3" opacity="0.3" />
                <line x1="40" y1="160" x2="480" y2="160" stroke="#64748b" opacity="0.5" />
                <line x1="40" y1="20" x2="40" y2="160" stroke="#64748b" opacity="0.5" />

                {activeMode === 'HHW' && (
                  <>
                    <path
                      d="M 60 40 Q 200 90 460 140"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="3"
                      strokeDasharray="4 4"
                    />
                    <path
                      d="M 60 55 Q 200 105 460 150"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="3.5"
                    />
                    <circle cx="280" cy="118" r="6" fill="#06b6d4" className="animate-pulse" />
                    <text x="295" y="115" fill="#22d3ee" fontSize="11" fontFamily="monospace">
                      Optimized: 70.0°C
                    </text>
                  </>
                )}

                {activeMode === 'CHW' && (
                  <>
                    <path
                      d="M 60 140 C 180 130 320 60 460 30"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="3"
                    />
                    <path
                      d="M 60 150 C 180 145 320 120 460 70"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeDasharray="4 4"
                    />
                    <circle cx="340" cy="55" r="6" fill="#38bdf8" className="animate-pulse" />
                    <text x="355" y="52" fill="#38bdf8" fontSize="11" fontFamily="monospace">
                      Optimized CHWS: 7.5°C
                    </text>
                  </>
                )}

                {activeMode === 'CW' && (
                  <>
                    <path
                      d="M 60 40 Q 260 150 460 45"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3.5"
                    />
                    <circle cx="260" cy="140" r="6" fill="#10b981" className="animate-pulse" />
                    <text x="275" y="138" fill="#34d399" fontSize="11" fontFamily="monospace">
                      Convex Minimum: 27.0°C
                    </text>
                  </>
                )}
              </svg>

              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-200">
                <span>Safe Minimum Limit</span>
                <span>Operating Equilibrium</span>
                <span>High Safety Clamping Floor</span>
              </div>
            </div>
          </div>

          {/* Reason explanation banner */}
          <div className="mt-4 p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-cyan-800 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Advisory Rationale: </span>
              {data ? data.reason : 'Evaluating multi-objective thermodynamic optimization candidates.'}
            </div>
          </div>
        </div>

        {/* DECISION & DISPATCH CARD */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                Supervisory Decision
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 text-[10px] font-mono">
                CONFIDENCE {data?.confidence != null ? `${(data.confidence * 100).toFixed(0)}%` : 'NO DATA'}
              </span>
            </div>

            <div className="mt-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between p-2 rounded bg-slate-100">
                <span className="text-slate-600">Selected Reset:</span>
                <span className="text-cyan-800 font-bold">{activeMode}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-100">
                <span className="text-slate-600">Current SP:</span>
                <span className="text-slate-800">{data?.current_setpoint != null ? `${data.current_setpoint} °C` : 'NO DATA'}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-cyan-50 border border-cyan-500/20">
                <span className="text-cyan-800 font-semibold">Recommended SP:</span>
                <span className="text-cyan-800 font-bold">{data?.optimized_setpoint != null ? `${data.optimized_setpoint} °C` : 'NO DATA'}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-100">
                <span className="text-slate-600">Safety Guardrail:</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {data?.status || data?.safety_status || 'NO DATA'}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-6 space-y-2">
            {actionError && (
              <div className="text-xs text-rose-800 border border-rose-500/30 bg-rose-950/40 rounded-lg px-3 py-2">
                {actionError}
              </div>
            )}
            <button
              onClick={handleDispatch}
              disabled={dispatchStatus === 'DISPATCHING'}
              className="btn-primary w-full justify-center disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              {dispatchStatus === 'DISPATCHING' ? 'Dispatching to BMS...' : `Dispatch ${activeMode} Reset (Priority 10)`}
            </button>
            <button
              onClick={handleVerify}
              disabled={verifyStatus === 'RUNNING'}
              className="btn-secondary w-full justify-center disabled:opacity-50"
            >
              <Clock className="w-3.5 h-3.5 text-cyan-800" />
              {verifyStatus === 'RUNNING' ? 'Running 15-Min M&V...' : 'Trigger M&V Verification'}
            </button>
          </div>
        </div>
      </div>

      {/* CANDIDATE EVALUATION MATRIX */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-800" />
          Multi-Candidate Optimization Matrix ({activeMode} Reset)
        </h3>
        <div className="eng-scroll rounded-xl border border-slate-200 bg-white">
          <table className="bms-table text-xs font-mono">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Setpoint</th>
                <th>Power Shed</th>
                <th className="pb-2">Safety Status</th>
                <th className="pb-2">Comfort Risk</th>
                <th className="pb-2 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data && data.candidates && data.candidates.length > 0 ? (
                data.candidates.map((c: any, i: number) => (
                  <tr key={i} className={c.decision === 'SELECTED_OPTIMAL' ? 'bg-cyan-500/10' : ''}>
                    <td className="py-2.5 text-slate-700 font-semibold">{c.candidate_id || `Candidate ${i+1}`}</td>
                    <td className="py-2.5 text-slate-900 font-bold">{c.setpoint || c.chws_setpoint || c.condenser_water_sp || c.hhw_setpoint} °C</td>
                    <td className="py-2.5 text-emerald-700">{c.net_power_shed_kw || c.power_shed_kw || 'NO DATA'} kW</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        c.safety_status === 'PASS' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {c.safety_status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{c.comfort_risk || 'NO DATA'}</td>
                    <td className="py-2.5 text-right">
                      {c.decision === 'SELECTED_OPTIMAL' ? (
                        <span className="text-cyan-800 font-bold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3" /> SELECTED
                        </span>
                      ) : (
                        <span className="text-slate-500">{c.decision}</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    NO DATA — no candidates returned for {activeMode}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OpportunityWorkspace>
  );
}

export default function TemperatureResetStudio() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-600 font-mono text-xs">Loading Temperature Reset Studio...</div>}>
      <TemperatureResetContent />
    </Suspense>
  );
}
