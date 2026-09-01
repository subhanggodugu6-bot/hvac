'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchO2Studio, triggerO2Optimize, triggerO2Rollback } from '@/lib/api';
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
  Thermometer,
  Zap,
  TrendingDown,
  ShieldCheck,
  Building,
  UserCheck,
  UserX,
  Sparkles,
  Cpu,
  Clock,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Activity,
  Gauge
} from 'lucide-react';

export default function SpaceTemperaturePage() {
  const queryClient = useQueryClient();
  const [selectedZoneId, setSelectedZoneId] = useState<string>('VAV-101');
  const [timeRangeHours, setTimeRangeHours] = useState<number>(1);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: studio } = useQuery({
    queryKey: ['o2-studio', selectedZoneId, timeRangeHours],
    queryFn: () => fetchO2Studio(selectedZoneId, timeRangeHours),
    refetchInterval: LIVE_POLL_MS,
  });
  const o2State = studio?.state;
  const zonesData = studio?.zones;
  const zoneDetail = studio?.zone_detail;
  const telemetryTrend = studio?.telemetry;
  const decisionData = studio?.decision;
  const safetyData = studio?.safety;
  const energyData = studio?.energy;
  const bmsActionData = studio?.bms_action;
  const historyData = studio?.history;
  const activitiesData = studio?.activities;

  // Mutations
  const optimizeMutation = useMutation({
    mutationFn: ({ zoneId, sp }: { zoneId: string; sp: number }) => triggerO2Optimize(zoneId, sp),
    onSuccess: (res) => {
      setActionMessage(`Optimization dispatched for ${res.zone_id}: Setpoint ${res.applied_setpoint}°C`);
      queryClient.invalidateQueries({ queryKey: ['o2-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: (zoneId: string) => triggerO2Rollback(zoneId),
    onSuccess: (res) => {
      setActionMessage(`Rollback executed for ${res.zone_id}: Reverted to ${res.rollback_setpoint}°C`);
      queryClient.invalidateQueries({ queryKey: ['o2-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    }
  });

  const kpis = o2State?.kpis || {};
  const zones = zonesData && zonesData.length > 0 ? zonesData : [];
  const activeZone = zoneDetail || (zones.length > 0 ? zones[0] : null);
  const cb = activeZone?.control_band;
  const recommendedSp = Number(decisionData?.recommended_setpoint ?? activeZone?.optimized_setpoint);
  const canApply = Number.isFinite(recommendedSp);
  const safetyPassed = safetyData?.passed_count ?? safetyData?.checks?.filter((c: { status?: string }) => c.status === 'PASS').length;
  const safetyTotal = safetyData?.total_count ?? safetyData?.checks?.length;

  return (
    <OpportunityWorkspace
      def={getOpportunity('O2')!}
      live={provenanceFromAgent(o2State)}
      model={o2State?.model_version}
    >
      <h2 className="sr-only">Space Temperature & Control Bands</h2>

      {actionMessage && <StatusBanner text={actionMessage} type="info" />}

      {/* ========================================================================= */}
      {/* 1. KPI SUMMARY (8 KPIs: 4 Existing + 4 New) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3.5">
        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Avg Occupied SP</span>
          <div className="my-1.5 text-base font-bold font-mono text-cyan-800">{kpis.avg_occupied_setpoint || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">+1.0°C Float</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Deadband Width</span>
          <div className="my-1.5 text-base font-bold font-mono text-emerald-700">{kpis.deadband_width || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">Zero Overlap</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Unoccupied Setback</span>
          <div className="my-1.5 text-base font-bold font-mono text-amber-800">{kpis.unoccupied_setback || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">±4.0°C Band</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Terminal Shed</span>
          <div className="my-1.5 text-base font-bold font-mono text-emerald-700">{kpis.terminal_power_shed_kw || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">Reheat Cut</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Comfort Compliance</span>
          <div className="my-1.5 text-base font-bold font-mono text-emerald-700">{kpis.comfort_compliance_pct || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">ASHRAE 55</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Zones Optimized</span>
          <div className="my-1.5 text-base font-bold font-mono text-sky-700">{kpis.zones_optimized || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">Active Float</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Avg Temp Error</span>
          <div className="my-1.5 text-base font-bold font-mono text-slate-800">{kpis.avg_temp_error || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">±0.2°C Target</span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Status</span>
          <div className="my-1.5 text-base font-bold font-mono text-emerald-700">{kpis.optimization_status || 'NO DATA'}</div>
          <span className="text-[10px] text-slate-600">Closed-Loop</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FACILITY ZONE THERMAL & SETPOINT MATRIX (8 VAV ZONES) */}
      {/* ========================================================================= */}
      <div className="glass-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-4">
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Facility Zone Thermal & Setpoint Matrix
            </h3>
          <span className="text-xs font-mono text-slate-600">
            Click any zone card to inspect control detail & dynamic bands
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {zones.map((z: any) => {
            const isSelected = z.zone_id === selectedZoneId;
            const isOccupied = z.occupancy === 'OCCUPIED' || z.occupied === true;

            return (
              <button
                type="button"
                key={z.zone_id}
                onClick={() => setSelectedZoneId(z.zone_id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer font-mono space-y-2.5 text-left w-full ${
                  isSelected
                    ? 'bg-cyan-50 border-cyan-400 shadow-lg shadow-cyan-200'
                    : 'bg-slate-50 border-slate-200 hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{z.zone_id}</span>
                  {isOccupied ? (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full pill-live">
                      <UserCheck className="w-3 h-3" />
                      <span>OCCUPIED</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800">
                      <UserX className="w-3 h-3" />
                      <span>UNOCCUPIED</span>
                    </span>
                  )}
                </div>

                <div className="font-sans text-xs text-slate-700 font-medium truncate">{z.name}</div>

                <div className="grid grid-cols-3 gap-2 text-xs py-2 border-y border-slate-200">
                  <div>
                    <span className="text-[9px] text-slate-500 block">Actual</span>
                    <strong className="text-slate-900">{z.actual_temperature}°C</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block">Current SP</span>
                    <strong className="text-slate-600">{z.current_setpoint}°C</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block">Optimized</span>
                    <strong className="text-cyan-800">{z.optimized_setpoint}°C</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>Damper: <span className="text-slate-800">{z.damper_position}%</span></div>
                  <div>Clg Valve: <span className="text-slate-800">{z.cooling_valve}%</span></div>
                  <div>Reheat: <span className="text-slate-800">{z.reheat_valve}%</span></div>
                  <div>Deadband: <span className="text-slate-800">{z.deadband != null ? `±${z.deadband / 2.0}°C` : 'NO DATA'}</span></div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200">
                  <span className="text-slate-600">Power Shed:</span>
                  <span className="text-emerald-700 font-semibold">{z.power_impact_kw != null ? `${z.power_impact_kw} kW` : 'NO DATA'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3 & 4. SELECTED ZONE CONTROL DETAIL & DYNAMIC CONTROL BAND */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 3. Selected Zone Control Detail */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Selected Zone Control Detail
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-800">{activeZone?.zone_id || selectedZoneId}</span>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Zone Name:</span>
              <span className="text-slate-900 font-semibold font-sans">{activeZone?.name || 'NO DATA'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Actual Temperature:</span>
              <span className="text-slate-900 font-bold">{activeZone?.actual_temperature}°C</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Current Setpoint:</span>
              <span className="text-slate-600">{activeZone?.current_setpoint}°C</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Optimized Setpoint:</span>
              <span className="text-cyan-800 font-bold">{activeZone?.optimized_setpoint}°C</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Temperature Error:</span>
              <span className="text-emerald-700 font-semibold">{activeZone?.temperature_error || 'NO DATA'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Occupancy State:</span>
              <span className="text-slate-800">{activeZone?.occupancy || 'NO DATA'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Cooling / Heating Demand:</span>
              <span className="text-slate-800">{activeZone?.cooling_demand}% / {activeZone?.heating_demand}%</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">VAV Damper Position:</span>
              <span className="text-slate-800">{activeZone?.damper_position}%</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Cooling / Reheat Valves:</span>
              <span className="text-slate-800">{activeZone?.cooling_valve}% / {activeZone?.reheat_valve}%</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Airflow (CFM):</span>
              <span className="text-slate-800">{activeZone?.airflow_cfm != null ? `${activeZone.airflow_cfm} CFM` : 'NO DATA'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600 font-sans">Sensor Quality:</span>
              <span className="text-emerald-700 font-semibold">{activeZone?.sensor_quality || 'NO DATA'}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600 font-sans">Last Telemetry:</span>
              <span className="text-slate-600">{activeZone?.last_telemetry || 'NO DATA'}</span>
            </div>
          </div>
        </div>

        {/* 4. Dynamic Control Band Visualization */}
        <div className="glass-card p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Dynamic Control Band & Temperature Bounds
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-600">Real-time Proportional Bands</span>
          </div>

          {cb ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-6">
            {/* Visual Bar Indicator */}
            <div className="relative pt-6 pb-2">
              {/* Range Scale */}
              <div className="h-8 rounded-lg bg-gradient-to-r from-blue-900/40 via-emerald-950/40 to-rose-900/40 border border-slate-200 flex relative overflow-hidden">
                <div className="h-full bg-blue-500/20 border-r border-blue-500/40" style={{ width: '25%' }} title="Heating Band"></div>
                <div className="h-full bg-emerald-500/20 border-r border-emerald-500/40" style={{ width: '50%' }} title="Deadband"></div>
                <div className="h-full bg-rose-500/20" style={{ width: '25%' }} title="Cooling Band"></div>
              </div>

              {/* Pointers */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 mt-2">
                <span>{cb.heating_limit}°C<br/><strong className="text-slate-500">Heating Limit</strong></span>
                <span>{cb.heating_band_start}°C<br/><strong className="text-blue-400">Heating Band</strong></span>
                <span className="text-emerald-700 font-bold">{cb.deadband_start}°C<br/><strong>Deadband Start</strong></span>
                <span className="text-cyan-800 font-bold text-center">{cb.optimized_setpoint}°C<br/><strong>Optimized SP</strong></span>
                <span className="text-emerald-700 font-bold">{cb.deadband_end}°C<br/><strong>Deadband End</strong></span>
                <span>{cb.cooling_limit}°C<br/><strong className="text-rose-700">Cooling Limit</strong></span>
              </div>
            </div>

            {/* Current Metrics Box */}
            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-center">
              <div>
                <span className="text-slate-500 block text-[10px]">CURRENT TEMPERATURE</span>
                <span className="text-base font-bold text-slate-900">{cb.current_temperature}°C</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">CURRENT SETPOINT</span>
                <span className="text-base font-bold text-slate-600">{cb.current_setpoint}°C</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">OPTIMIZED SETPOINT</span>
                <span className="text-base font-bold text-cyan-800">{cb.optimized_setpoint}°C</span>
              </div>
            </div>
          </div>
          ) : (
            <div className="p-4 text-xs font-mono text-slate-500">NO DATA</div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. TEMPERATURE & SETPOINT TREND (LIVE TIME-SERIES) */}
      {/* ========================================================================= */}
      <div className="glass-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-800" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Temperature & Setpoint Response — {selectedZoneId}
              </h3>
              <p className="text-xs text-slate-600 font-sans mt-0.5">
                Real-time closed-loop temperature tracking vs comfort boundary limits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {[1, 4, 12, 24].map((hrs) => (
              <button
                key={hrs}
                onClick={() => setTimeRangeHours(hrs)}
                className={`text-xs font-mono px-2.5 py-1 rounded border transition-all ${
                  timeRangeHours === hrs
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-800 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800'
                }`}
              >
                {hrs}h
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 w-full">
          <EngineeringChart height={288}>
            <LineChart data={telemetryTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
              <YAxis stroke={CHART_COLORS.axis} fontSize={11} domain={[20.0, 25.5]} tickLine={false} unit="°C" />
              <Tooltip content={EngineeringTooltip} />
              <ReferenceLine y={24.0} stroke="#f59e0b" strokeDasharray="3 3" />
              <ReferenceLine y={21.0} stroke="#3b82f6" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="actual_temp" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="Actual Temp (°C)" />
              <Line type="monotone" dataKey="current_setpoint" stroke={CHART_COLORS.baseline} strokeWidth={1.5} strokeDasharray="2 2" dot={false} name="Baseline SP" />
              <Line type="monotone" dataKey="optimized_setpoint" stroke={CHART_COLORS.optimized} strokeWidth={2} dot={false} name="Optimized SP" />
            </LineChart>
          </EngineeringChart>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. CANDIDATE SETPOINT EVALUATION */}
      {/* ========================================================================= */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-800" />
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Candidate Setpoint Evaluation — {selectedZoneId}
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-600">Multi-Objective Cost Optimization</span>
        </div>

        <div className="overflow-x-auto eng-scroll">
          <table className="bms-table">
            <thead>
              <tr>
                <th>Candidate Option</th>
                <th>Setpoint</th>
                <th>Deadband</th>
                <th>Predicted Energy</th>
                <th>Comfort Risk</th>
                <th>Stability</th>
                <th>Cycling</th>
                <th>Power Impact</th>
                <th>Safety</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {(activeZone?.candidates || []).map((cand: any, i: number) => (
                <tr key={i} className={cand.decision === 'SELECTED' ? 'bg-cyan-50' : ''}>
                  <td className="font-sans font-semibold text-slate-800">{cand.candidate_id}</td>
                  <td className="text-cyan-800 font-bold">{cand.setpoint}°C</td>
                  <td className="text-slate-700">±{cand.deadband / 2.0}°C</td>
                  <td className="text-slate-800">{cand.predicted_energy_kw} kW</td>
                  <td className={cand.comfort_risk > 0.30 ? 'text-rose-700 font-bold' : 'text-slate-700'}>
                    {cand.comfort_risk != null ? cand.comfort_risk.toFixed(2) : 'NO DATA'}
                  </td>
                  <td className="text-slate-700">{cand.temp_stability}</td>
                  <td className="text-slate-700">{cand.equipment_cycling}</td>
                  <td className="text-emerald-700 font-semibold">{cand.power_impact}</td>
                  <td>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        cand.safety_status === 'PASS'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                          : 'pill-fail'
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
                          ? 'pill-fail'
                          : 'bg-slate-200 border-slate-200 text-slate-600'
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
      {/* 7 & 8. OPTIMIZATION DECISION & COMFORT/SAFETY VALIDATION */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 7. O2 Supervisory Decision */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-800" />
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O2 Supervisory Decision — {selectedZoneId}
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded pill-live">
              {decisionData?.decision || 'NO DATA'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-500 block">CURRENT SP</span>
              <span className="text-sm font-bold text-slate-700">{decisionData?.current_setpoint != null ? `${decisionData.current_setpoint}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">RECOMMENDED SP</span>
              <span className="text-base font-bold text-cyan-800">{decisionData?.recommended_setpoint != null ? `${decisionData.recommended_setpoint}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">DEADBAND</span>
              <span className="text-sm font-bold text-emerald-700">{decisionData?.deadband || 'NO DATA'}</span>
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
              <span>Apply Recommended Setpoint</span>
            </button>
          </div>
        </div>

        {/* 8. Comfort & Safety Validation */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Comfort & Safety Validation — {selectedZoneId}
              </h3>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded pill-live">
              {safetyTotal ? `${safetyPassed}/${safetyTotal} PASSED` : 'NO DATA'}
            </span>
          </div>

          {/* Comfort Risk Filter Banner */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-4 gap-2 text-xs font-mono text-center">
            <div>
              <span className="text-[10px] text-slate-500 block">COMFORT MIN/MAX</span>
              <span className="text-slate-800 font-bold">{safetyData?.comfort_min != null && safetyData?.comfort_max != null ? `${safetyData.comfort_min}°C – ${safetyData.comfort_max}°C` : 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">RISK THRESHOLD</span>
              <span className="text-slate-700">{safetyData?.risk_threshold ?? 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">CANDIDATE RISK</span>
              <span className="text-emerald-700 font-bold">{safetyData?.candidate_risk ?? 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">FILTER STATUS</span>
              <span className="text-emerald-700 font-bold">{safetyData?.filter_status ?? 'NO DATA'}</span>
            </div>
          </div>

          {/* 9 Safety Checks Table */}
          <div className="overflow-y-auto max-h-48 border border-slate-200 rounded-lg">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Validation Check</th>
                  <th>Value</th>
                  <th>Threshold</th>
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
      </div>

      {/* ========================================================================= */}
      {/* 9 & 10. ENERGY IMPACT & BMS ACTION / VERIFICATION */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 9. Energy Impact */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Energy Impact & Realization Tiers
              </h3>
            <span className="text-xs font-mono text-emerald-700 font-bold">{energyData?.predicted_power_reduction_kw != null ? `+${energyData.predicted_power_reduction_kw} kW Shed` : 'NO DATA'}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">BASELINE POWER</span>
              <span className="text-sm font-bold text-slate-700">{energyData?.baseline_terminal_power_kw != null ? `${energyData.baseline_terminal_power_kw} kW` : 'NO DATA'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">OPTIMIZED POWER</span>
              <span className="text-sm font-bold text-slate-900">{energyData?.optimized_terminal_power_kw != null ? `${energyData.optimized_terminal_power_kw} kW` : 'NO DATA'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">PREDICTED SHED</span>
              <span className="text-sm font-bold text-sky-700">{energyData?.predicted_power_reduction_kw != null ? `${energyData.predicted_power_reduction_kw} kW` : 'NO DATA'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block">VERIFIED SHED</span>
              <span className="text-sm font-bold text-emerald-700">{energyData?.verified_power_reduction_kw != null ? `${energyData.verified_power_reduction_kw} kW` : 'NO DATA'}</span>
            </div>
          </div>

          <div className="space-y-2 text-xs font-mono">
            {(energyData?.tiers || []).map((t: any, i: number) => (
              <div key={i} className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">{t.name}</span>
                  <span className="text-[11px] text-slate-600 font-sans">{t.desc}</span>
                </div>
                <span className="text-emerald-700 font-bold text-sm">{t.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 10. BMS Action & Verification */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                BMS Control Action & Verification — {selectedZoneId}
              </h3>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-700">
              {bmsActionData?.bms_status || 'NO DATA'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-xs text-center p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 block">TARGET POINT</span>
              <span className="text-slate-900 font-bold">{bmsActionData?.target_point || `${selectedZoneId}.Zone_Setpoint`}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">PREVIOUS VALUE</span>
              <span className="text-slate-600">{bmsActionData?.previous_value || 'NO DATA'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">APPLIED VALUE</span>
              <span className="text-cyan-800 font-bold">{bmsActionData?.applied_value || 'NO DATA'}</span>
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
              <strong>Window:</strong> 15 min · <strong>Expected:</strong> Temperature remains in comfort envelope · <strong>Actual:</strong> {bmsActionData?.verification?.actual_response || 'NO DATA'}
            </div>
          </div>

          {/* Rollback Trigger Button */}
          <div className="pt-2">
            <button
              onClick={() => rollbackMutation.mutate(selectedZoneId)}
              className="btn-danger w-full justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rollback {selectedZoneId} to Baseline (22.5°C)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 11 & 12. OPTIMIZATION HISTORY & LIVE AGENT ACTIVITY */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 11. O2 Optimization History */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                O2 Optimization History
              </h3>
            <span className="text-xs font-mono text-slate-600">Database Records</span>
          </div>

          <div className="overflow-x-auto eng-scroll">
            <table className="bms-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Zone</th>
                  <th>Prev</th>
                  <th>New</th>
                  <th>Deadband</th>
                  <th>Power Impact</th>
                  <th>BMS</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {(historyData || []).map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="text-slate-600">{h.time}</td>
                    <td className="text-slate-900 font-bold">{h.zone_id}</td>
                    <td className="text-slate-600">{h.prev_sp}</td>
                    <td className="text-cyan-800 font-bold">{h.new_sp}</td>
                    <td className="text-slate-700">{h.deadband}</td>
                    <td className="text-emerald-700 font-semibold">{h.power_impact}</td>
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

        {/* 12. Live Agent Activity */}
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

          <div className="overflow-x-auto eng-scroll">
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
                    <td className="text-slate-600">{act.time}</td>
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
