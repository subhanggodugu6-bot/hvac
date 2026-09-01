'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import {
  Zap,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Activity,
  Gauge,
  TrendingDown,
  Thermometer,
  Layers,
  FileText,
  Clock,
  RefreshCw,
  Eye,
  Check,
  AlertCircle,
  Cpu,
  Server,
  Wrench,
  ShieldCheck,
  BarChart3,
  Calendar
} from 'lucide-react';
import {
  fetchO9Assessment
} from '@/lib/plantControlApi';

interface TechnicalParam {
  parameter: string;
  current: string | null;
  expected: string;
  difference: string | null;
  limit: string;
  assessment: string;
}

export default function O9ElectronicExpansionValveStudio() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetchO9Assessment();
      setData(res);
    } catch (err) {
      console.error('Failed to load O9 assessment:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const technicalParams: TechnicalParam[] = Array.isArray(data?.technical_params) ? data.technical_params : [];
  const timeline = Array.isArray(data?.comparison_timeline) ? data.comparison_timeline : [];
  const paybackCurve = Array.isArray(data?.payback_curve) ? data.payback_curve : [];

  return (
    <OpportunityWorkspace
      def={getOpportunity('O9')!}
      live={provenanceFromAgent(data)}
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-cyan-800" />
            ENGINEERING ASSESSMENT ONLY (NON-DISPATCHING)
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-secondary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-800' : ''}`} />
            Recalculate ROI
          </button>
        </div>
      }
    >

      {loading && !data ? (
        <p className="text-[11px] font-mono text-slate-500">Loading O9 assessment…</p>
      ) : null}

      {/* Engineering Recommendation Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-cyan-50 to-slate-50 border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-800 border border-emerald-500/40">
              {data?.recommendation ?? 'NO DATA'}
            </span>
            <span className="text-xs text-slate-700 font-semibold">Technical Feasibility: {data?.technical_feasibility_pct != null ? `${data.technical_feasibility_pct}%` : 'NO DATA'}</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed max-w-3xl">
            {data?.justification ?? 'Telemetry is not currently available for this opportunity.'}
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0 bg-slate-100 px-4 py-3 rounded-xl border border-slate-200">
          <div className="text-center">
            <div className="text-xs text-slate-600 font-semibold">Simple Payback</div>
            <div className="text-xl font-bold text-emerald-700 font-mono">{data?.payback_years != null ? data.payback_years : 'NO DATA'} {data?.payback_years != null && <span className="text-xs font-normal">Yrs</span>}</div>
          </div>
          <div className="h-8 w-px bg-white/[0.08]" />
          <div className="text-center">
            <div className="text-xs text-slate-600 font-semibold">5-Yr Net ROI</div>
            <div className="text-xl font-bold text-cyan-800 font-mono">{data?.five_year_net_roi_pct != null ? `+${data.five_year_net_roi_pct}%` : 'NO DATA'}</div>
          </div>
        </div>
      </div>

      {/* Current Operational Telemetry vs Projected EXV Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <div className="kpi-tile">
          <div className="text-slate-600 text-xs font-medium">1. Current Technology</div>
          <div className="text-sm font-bold text-amber-700">{data?.current_technology ?? 'NO DATA'}</div>
        </div>
        <div className="kpi-tile kpi-tile-accent">
          <div className="text-violet-700 text-xs font-semibold uppercase tracking-wide">2. Proposed Tech</div>
          <div className="text-sm font-bold text-slate-900">{data?.proposed_technology ?? 'NO DATA'}</div>
        </div>
        <div className="kpi-tile">
          <div className="text-slate-400 text-xs">3. Superheat Hunting</div>
          <div className="text-base font-bold text-rose-400 font-mono">{data?.current_hunting_c != null ? `±${data.current_hunting_c}°C TXV` : 'NO DATA'}</div>
          <div className="text-[10px] text-emerald-700">{data?.exv_stability_c != null ? `Projected: ±${data.exv_stability_c}°C EXV` : ''}</div>
        </div>
        <div className="kpi-tile">
          <div className="text-slate-400 text-xs">4. Superheat Target</div>
          <div className="text-base font-bold text-slate-900 font-mono">
            {data?.current_superheat_c != null ? `${data.current_superheat_c}°C` : 'NO DATA'}
            {data?.target_superheat_c != null && <span className="text-emerald-700"> → {data.target_superheat_c}°C</span>}
          </div>
        </div>
        <div className="kpi-tile">
          <div className="text-slate-400 text-xs">5. Suction Pressure</div>
          <div className="text-base font-bold text-slate-900 font-mono">
            {data?.current_suction_pressure_psig != null ? `${data.current_suction_pressure_psig}` : 'NO DATA'}
            {data?.projected_suction_pressure_psig != null && <span className="text-cyan-800"> → {data.projected_suction_pressure_psig} psi</span>}
          </div>
        </div>
        <div className="kpi-tile kpi-tile-accent">
          <div className="text-emerald-800 text-xs">6. Compressor COP</div>
          <div className="text-base font-bold text-emerald-800 font-mono">
            {data?.current_cop != null ? data.current_cop : 'NO DATA'}
            {data?.projected_cop != null && <> → {data.projected_cop}</>}
          </div>
          <div className="text-[10px] text-emerald-700">{data?.cop_improvement_pct != null ? `+${data.cop_improvement_pct}% COP (model)` : ''}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Superheat Hunting vs EXV Precision */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-400" />
              Superheat Stability: Mechanical TXV Hunting vs EXV Precision
            </h2>
            <span className="text-[11px] text-slate-600 font-mono">24-Hour Cycle</span>
          </div>

          <div className="h-56 w-full bg-slate-100 rounded-xl p-4 border border-slate-200 flex items-center justify-center">
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-500">NO DATA — superheat history is empty</p>
            ) : (
              <div className="w-full space-y-2">
                {timeline.slice(-8).map((row: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{row.timestamp || row.time || `sample ${idx + 1}`}</span>
                    <span>{row.txv != null ? `TXV ${row.txv}` : row.setpoint != null ? `SP ${row.setpoint}` : JSON.stringify(row).slice(0, 40)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-rose-500 rounded-full" />
              <span>Mechanical TXV (±3.5°C Hunting)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-emerald-400 rounded-full" />
              <span>Electronic EXV (±0.5°C Target 3.0°C)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-red-500 rounded-full border border-dashed border-red-500" />
              <span>Floodback Floor (2.0°C)</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Cumulative Cash Flow & Payback Breakeven Curve */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              5-Year Cumulative Cash Flow & Breakeven Curve
            </h2>
            <span className="text-[11px] text-emerald-700 font-mono">{data?.payback_years != null ? `Payback ${data.payback_years} yrs` : 'NO DATA'}</span>
          </div>

          <div className="h-56 w-full bg-slate-100 rounded-xl p-4 border border-slate-200 flex flex-col justify-between">
            {paybackCurve.length === 0 ? (
              <p className="text-xs text-slate-500 m-auto">NO DATA</p>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2">
                {paybackCurve.map((p: { year: string; cash_flow: number }, idx: number) => (
                  <div key={idx} className="flex flex-col items-center">
                    <span>{p.year}</span>
                    <span className={`text-[10px] font-mono ${p.cash_flow >= 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {p.cash_flow >= 0 ? `+$${p.cash_flow}` : `-$${Math.abs(p.cash_flow)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-emerald-400 rounded-full" />
              <span>Cumulative Net Benefit ($)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Breakeven from engine payback years</span>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Assessment Parameter Table */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-indigo-400" />
              Refrigeration Cycle Technical Assessment Matrix
            </h2>
            <p className="text-xs text-slate-400">
              Thermodynamic parameter comparison between existing mechanical TXV and micro-stepper EXV.
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="eng-scroll rounded-xl border border-slate-200 bg-white">
          <table className="bms-table text-xs">
            <thead>
              <tr>
                <th>Thermodynamic Parameter</th>
                <th>Current TXV</th>
                <th>Projected EXV</th>
                <th className="py-2.5 px-3">Difference</th>
                <th className="py-2.5 px-3">Engineering Safety Limit</th>
                <th className="py-2.5 px-3 text-right">Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-slate-700 font-mono">
              {technicalParams.length === 0 && (
                <tr>
                  <td className="py-3 px-3 text-slate-500" colSpan={6}>NO DATA</td>
                </tr>
              )}
              {technicalParams.map((param, idx) => (
                <tr key={idx} className="hover:bg-slate-100 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-900 font-sans">{param.parameter}</td>
                  <td className="py-2.5 px-3 text-rose-800">{param.current ?? 'NO DATA'}</td>
                  <td className="py-2.5 px-3 text-emerald-800 font-bold">{param.expected}</td>
                  <td className="py-2.5 px-3 text-cyan-800">{param.difference ?? 'NO DATA'}</td>
                  <td className="py-2.5 px-3 text-slate-600">{param.limit}</td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                      /FAIL|REJECT|RISK|BLOCK/i.test(String(param.assessment || ''))
                        ? 'text-rose-400'
                        : 'text-emerald-700'
                    }`}>
                      <CheckCircle2 className="w-3 h-3" />
                      {param.assessment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Economic Assessment Breakdown */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-700" />
            Capital Investment & Lifecycle Economic Projections
          </h2>
          <span className="text-xs text-slate-600 font-mono font-medium">Utility Rate: $0.12 / kWh</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Estimated Retrofit Capex</div>
            <div className="text-lg font-bold text-slate-900 font-mono">{data?.estimated_capital_cost_usd != null ? `$${Number(data.estimated_capital_cost_usd).toLocaleString()}` : 'NO DATA'}</div>
            <div className="text-[10px] text-slate-500">Hardware + Installation</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Annual Energy Savings</div>
            <div className="text-lg font-bold text-emerald-700 font-mono">{data?.annual_kwh_savings != null ? `${Number(data.annual_kwh_savings).toLocaleString()} kWh` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">{data?.annual_cost_savings_usd != null ? `$${Number(data.annual_cost_savings_usd).toLocaleString()} / yr` : ''}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Maintenance Reduction</div>
            <div className="text-lg font-bold text-cyan-800 font-mono">{data?.annual_maintenance_savings_usd != null ? `$${data.annual_maintenance_savings_usd} / yr` : 'NO DATA'}</div>
            <div className="text-[10px] text-slate-500">Zero power bulb failures</div>
          </div>

          <div className="kpi-tile kpi-tile-accent">
            <div className="text-emerald-800">Total Annual Benefit</div>
            <div className="text-lg font-bold text-emerald-800 font-mono">{data?.total_annual_savings_usd != null ? `$${Number(data.total_annual_savings_usd).toLocaleString()} / yr` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">Net Operating Inflow</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">Simple Payback Period</div>
            <div className="text-lg font-bold text-amber-700 font-mono">{data?.payback_years != null ? `${data.payback_years} Years` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">&lt; 2.5 Yr Benchmark</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-400">5-Year Cumulative ROI</div>
            <div className="text-lg font-bold text-emerald-700 font-mono">{data?.five_year_net_roi_pct != null ? `+${data.five_year_net_roi_pct}%` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">{data?.five_year_net_benefit_usd != null ? `$${Number(data.five_year_net_benefit_usd).toLocaleString()} net` : ''}</div>
          </div>
        </div>
      </div>
    </OpportunityWorkspace>
  );
}
