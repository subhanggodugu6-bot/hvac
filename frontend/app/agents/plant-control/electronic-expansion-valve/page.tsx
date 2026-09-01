'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { EmptyState } from '@/components/hvac/EmptyState';
import { MiniBarChart, MiniLineChart } from '@/components/hvac/MiniChart';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { RefreshCw } from 'lucide-react';
import { fetchO9Assessment } from '@/lib/plantControlApi';

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

  const superheatSeries = useMemo(() => {
    const timeline = Array.isArray(data?.comparison_timeline) ? data.comparison_timeline : [];
    const txv: number[] = [];
    const exv: number[] = [];
    const labels: string[] = [];
    for (const row of timeline) {
      const t = row?.txv ?? row?.txv_superheat ?? row?.mechanical;
      const e = row?.exv ?? row?.exv_superheat ?? row?.electronic ?? row?.setpoint;
      if (typeof t === 'number' && Number.isFinite(t)) txv.push(t);
      if (typeof e === 'number' && Number.isFinite(e)) exv.push(e);
      labels.push(String(row?.timestamp || row?.time || '').slice(11, 16) || `t${labels.length + 1}`);
    }
    if (!txv.length && !exv.length) return null;
    const series = [];
    if (txv.length) series.push({ key: 'txv', name: 'Mechanical TXV', values: txv });
    if (exv.length) series.push({ key: 'exv', name: 'Electronic EXV', values: exv });
    return { series, labels: labels.slice(0, Math.max(txv.length, exv.length)) };
  }, [data?.comparison_timeline]);

  const paybackBars = useMemo(() => {
    const paybackCurve = Array.isArray(data?.payback_curve) ? data.payback_curve : [];
    return paybackCurve.map((p: { year: string; cash_flow: number }) => ({
      label: String(p.year).replace('Year ', 'Y'),
      value: Number(p.cash_flow) || 0,
    }));
  }, [data?.payback_curve]);

  return (
    <OpportunityWorkspace
      def={getOpportunity('O9')!}
      live={provenanceFromAgent(data)}
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded border border-slate-200 text-slate-700 text-xs font-semibold">
            ENGINEERING ASSESSMENT ONLY (NON-DISPATCHING)
          </div>
          <button onClick={() => loadData(true)} disabled={refreshing} className="btn-secondary inline-flex items-center gap-1.5">
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
          <div className="text-slate-600 text-xs">3. Superheat Hunting</div>
          <div className="text-base font-bold text-rose-700 font-mono">{data?.current_hunting_c != null ? `±${data.current_hunting_c}°C TXV` : 'NO DATA'}</div>
          <div className="text-[10px] text-emerald-700">{data?.exv_stability_c != null ? `Projected: ±${data.exv_stability_c}°C EXV` : ''}</div>
        </div>
        <div className="kpi-tile">
          <div className="text-slate-600 text-xs">4. Superheat Target</div>
          <div className="text-base font-bold text-slate-900 font-mono">
            {data?.current_superheat_c != null ? `${data.current_superheat_c}°C` : 'NO DATA'}
            {data?.target_superheat_c != null && <span className="text-emerald-700"> → {data.target_superheat_c}°C</span>}
          </div>
        </div>
        <div className="kpi-tile">
          <div className="text-slate-600 text-xs">5. Suction Pressure</div>
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Superheat stability: TXV vs EXV</h2>
            <span className="text-[11px] text-slate-600 font-mono">24-hour cycle</span>
          </div>

          <div className="min-h-[14rem] w-full bg-white rounded-xl p-4 border border-slate-200">
            {!superheatSeries ? (
              <EmptyState
                title="NO SUPERHEAT SERIES"
                detail="comparison_timeline is empty. Connect chiller telemetry or run the O9 assessment engine."
              />
            ) : (
              <MiniLineChart
                series={superheatSeries.series}
                labels={superheatSeries.labels}
                colors={['#f43f5e', '#10b981']}
                ariaLabel="Superheat stability comparison"
              />
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">5-year cumulative cash flow</h2>
            <span className="text-[11px] text-emerald-700 font-mono">{data?.payback_years != null ? `Payback ${data.payback_years} yrs` : 'NO DATA'}</span>
          </div>

          <div className="min-h-[14rem] w-full bg-white rounded-xl p-4 border border-slate-200">
            {paybackBars.length === 0 ? (
              <EmptyState title="NO PAYBACK CURVE" detail="payback_curve is empty until ROI is calculated." onRetry={() => loadData(true)} />
            ) : (
              <MiniBarChart items={paybackBars} ariaLabel="Annual cash flow by year" />
            )}
          </div>
        </div>
      </div>

      {/* Technical Assessment Parameter Table */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Refrigeration cycle technical assessment</h2>
            <p className="text-xs text-slate-600">
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
            <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
              {technicalParams.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState title="NO PARAMETERS" detail="Technical assessment matrix is empty." />
                  </td>
                </tr>
              ) : null}
              {technicalParams.map((param, idx) => (
                <tr key={idx} className="hover:bg-slate-100 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-900 font-sans">{param.parameter}</td>
                  <td className="py-2.5 px-3 text-rose-800">{param.current ?? 'NO DATA'}</td>
                  <td className="py-2.5 px-3 text-emerald-800 font-bold">{param.expected}</td>
                  <td className="py-2.5 px-3 text-cyan-800">{param.difference ?? 'NO DATA'}</td>
                  <td className="py-2.5 px-3 text-slate-600">{param.limit}</td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <span className={`text-[11px] font-semibold ${
                      /FAIL|REJECT|RISK|BLOCK/i.test(String(param.assessment || ''))
                        ? 'text-rose-700'
                        : 'text-emerald-700'
                    }`}>
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
          <h2 className="text-base font-semibold text-slate-900">Capital investment & lifecycle economics</h2>
          <span className="text-xs text-slate-600 font-mono font-medium">Utility Rate: $0.12 / kWh</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-600">Estimated Retrofit Capex</div>
            <div className="text-lg font-bold text-slate-900 font-mono">{data?.estimated_capital_cost_usd != null ? `$${Number(data.estimated_capital_cost_usd).toLocaleString()}` : 'NO DATA'}</div>
            <div className="text-[10px] text-slate-500">Hardware + Installation</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-600">Annual Energy Savings</div>
            <div className="text-lg font-bold text-emerald-700 font-mono">{data?.annual_kwh_savings != null ? `${Number(data.annual_kwh_savings).toLocaleString()} kWh` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">{data?.annual_cost_savings_usd != null ? `$${Number(data.annual_cost_savings_usd).toLocaleString()} / yr` : ''}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-600">Maintenance Reduction</div>
            <div className="text-lg font-bold text-cyan-800 font-mono">{data?.annual_maintenance_savings_usd != null ? `$${data.annual_maintenance_savings_usd} / yr` : 'NO DATA'}</div>
            <div className="text-[10px] text-slate-500">Zero power bulb failures</div>
          </div>

          <div className="kpi-tile kpi-tile-accent">
            <div className="text-emerald-800">Total Annual Benefit</div>
            <div className="text-lg font-bold text-emerald-800 font-mono">{data?.total_annual_savings_usd != null ? `$${Number(data.total_annual_savings_usd).toLocaleString()} / yr` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">Net Operating Inflow</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-600">Simple Payback Period</div>
            <div className="text-lg font-bold text-amber-700 font-mono">{data?.payback_years != null ? `${data.payback_years} Years` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">&lt; 2.5 Yr Benchmark</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 space-y-1">
            <div className="text-slate-600">5-Year Cumulative ROI</div>
            <div className="text-lg font-bold text-emerald-700 font-mono">{data?.five_year_net_roi_pct != null ? `+${data.five_year_net_roi_pct}%` : 'NO DATA'}</div>
            <div className="text-[10px] text-emerald-700">{data?.five_year_net_benefit_usd != null ? `$${Number(data.five_year_net_benefit_usd).toLocaleString()} net` : ''}</div>
          </div>
        </div>
      </div>
    </OpportunityWorkspace>
  );
}
