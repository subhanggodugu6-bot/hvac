'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchO4Studio, triggerO4Rollback } from '@/lib/api';
import { LIVE_POLL_MS } from '@/lib/hvac/poll';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { StatusBanner } from '@/components/ui/StatusBanner';
import { PanelSectionHeader } from '@/components/ui/PanelSectionHeader';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';
import { O4KpiGrid } from './O4KpiGrid';
import { O4ChwsCandidates, O4StageCandidates } from './O4CandidatePanels';
import { O4PowerTradeoff } from './O4PowerTradeoff';
import {
  EngineeringChart,
  EngineeringTooltip,
  CHART_COLORS,
} from '@/components/hvac/EngineeringChart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Activity, Gauge, RotateCcw, Server, Snowflake, Timer, Zap } from 'lucide-react';

export function O4Dashboard() {
  const queryClient = useQueryClient();
  const [timeRangeHours, setTimeRangeHours] = useState(1);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: studio, isLoading } = useQuery({
    queryKey: ['o4-studio', timeRangeHours],
    queryFn: () => fetchO4Studio(timeRangeHours),
    refetchInterval: LIVE_POLL_MS,
  });

  const rollbackMutation = useMutation({
    mutationFn: () => triggerO4Rollback(),
    onSuccess: (res) => {
      setActionMessage(`Rollback: plant reverted to ${res.rollback_chws}°C baseline (1 chiller)`);
      queryClient.invalidateQueries({ queryKey: ['o4-studio'] });
      setTimeout(() => setActionMessage(null), 4000);
    },
  });

  const o4State = studio?.state;
  const load = studio?.load || {};
  const kpis = o4State?.kpis || {};
  const chillers = studio?.chillers || [];
  const decision = studio?.decision;
  const safety = studio?.safety;
  const telemetryTrend = studio?.telemetry || [];
  const plantTrend = studio?.plant_trend || [];
  const history = studio?.history || [];
  const activities = studio?.activities || [];
  const power = studio?.power;

  return (
    <OpportunityWorkspace def={getOpportunity('O4')!} live={provenanceFromAgent(o4State)} model={o4State?.model_version}>
      <h2 className="sr-only">Chiller &amp; compressor staging</h2>

      {actionMessage ? <StatusBanner text={actionMessage} type="info" /> : null}
      {isLoading && !studio ? (
        <div className="text-[11px] font-mono text-slate-500 py-2">Loading O4 plant evaluation…</div>
      ) : null}

      <O4KpiGrid kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card lg:col-span-2 overflow-hidden">
          <PanelSectionHeader
            title="Central plant cooling load & hydraulic balance"
            subtitle="Live tonnage, delta-T, and flow from simulation feed"
            aside={
              <span className="text-xs font-mono font-bold text-cyan-800">
                {load.current_load_tons != null ? `${load.current_load_tons} / ${load.available_capacity_tons ?? '—'} T` : '—'}
              </span>
            }
          />
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
            {[
              ['Cooling load', load.current_load_tons != null ? `${load.current_load_tons} T` : '—'],
              ['Available cap', load.available_capacity_tons != null ? `${load.available_capacity_tons} T` : '—'],
              ['Headroom', load.capacity_headroom_tons != null ? `${load.capacity_headroom_tons} T` : '—'],
              ['Plant PLR', load.plant_plr_pct != null ? `${load.plant_plr_pct}%` : '—'],
            ].map(([label, val]) => (
              <div key={label} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">{label}</div>
                <div className="text-base font-bold text-slate-900 mt-1">{val}</div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono text-center">
            {[
              ['CHWS', load.chws_temp != null ? `${load.chws_temp}°C` : '—'],
              ['CHWR', load.chwr_temp != null ? `${load.chwr_temp}°C` : '—'],
              ['ΔT', load.delta_t_c != null ? `${load.delta_t_c}°C` : '—'],
              ['Flow', load.flow_lps != null ? `${load.flow_lps} L/s` : '—'],
            ].map(([label, val]) => (
              <div key={label} className="p-2 rounded bg-slate-100 border border-slate-200">
                <div className="text-[9px] text-slate-500">{label}</div>
                <div className="font-bold text-slate-800">{val}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <PanelSectionHeader
            title="Anti-short-cycling timers"
            subtitle="Minimum runtime / off-time guardrails"
            aside={<Timer className="w-4 h-4 text-emerald-700" aria-hidden />}
          />
          <div className="p-4 space-y-2 text-xs font-mono">
            {[
              ['CH-01 min runtime', load.ch01_runtime, load.ch01_runtime_status],
              ['CH-02 min off-time', load.ch02_off_time, load.ch02_off_status],
              ['Stage hysteresis', load.stage_hysteresis, load.stage_hysteresis_status],
            ].map(([title, val, status]) => (
              <div key={String(title)} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
                <span className="text-slate-800 font-sans font-medium">{title}</span>
                <span className="text-emerald-700 font-bold">{status || val || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <O4StageCandidates rows={studio?.stage_candidates} />
        <O4ChwsCandidates rows={studio?.chws_candidates} />
      </div>

      <O4PowerTradeoff power={power} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card lg:col-span-2 overflow-hidden">
          <PanelSectionHeader title="Chiller fleet status" subtitle="Lead/lag roles and staging decision" aside={<Server className="w-4 h-4 text-cyan-800" />} />
          <div className="overflow-x-auto eng-scroll">
            {chillers.length === 0 ? (
              <div className="p-6"><TableEmptyState colSpan={6} title="NO CHILLERS" detail="Fleet telemetry not available." /></div>
            ) : (
              <table className="bms-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Status</th><th>Load</th><th>PLR</th><th>Power</th><th>kW/T</th><th>Role</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {chillers.map((ch: any) => (
                    <tr key={ch.chiller_id} className={ch.status === 'RUNNING' ? 'bg-cyan-50/60' : undefined}>
                      <td className="font-bold">{ch.chiller_id}</td>
                      <td><span className={ch.status === 'RUNNING' ? 'pill-pass' : 'pill-muted'}>{ch.status}</span></td>
                      <td>{ch.current_load_tons} T</td>
                      <td className="text-purple-700">{ch.plr_pct}%</td>
                      <td>{ch.power_kw} kW</td>
                      <td className="text-emerald-700">{ch.efficiency_kw_per_ton || '—'}</td>
                      <td className="text-cyan-800">{ch.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <PanelSectionHeader title="O4 supervisory decision" subtitle="Selected stage + CHWS reset" aside={<Zap className="w-4 h-4 text-cyan-800" />} />
          <div className="p-4 space-y-3 font-mono text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-[9px] text-slate-500">LOAD</div><div className="font-bold">{decision?.current_load_tons ?? '—'} T</div></div>
              <div><div className="text-[9px] text-slate-500">STAGE</div><div className="font-bold text-cyan-800">{decision?.optimal_stage ?? '—'}</div></div>
              <div><div className="text-[9px] text-slate-500">CHWS</div><div className="font-bold text-emerald-700">{decision?.optimal_chws ?? '—'}°C</div></div>
            </div>
            <p className="text-xs text-slate-600 font-sans leading-relaxed border-t border-slate-200 pt-3">
              {decision?.reason || 'No decision rationale returned.'}
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" disabled className="btn-primary flex-1 justify-center opacity-40" title="Write disabled in demo">
                Apply staging
              </button>
              <button type="button" onClick={() => rollbackMutation.mutate()} className="btn-danger shrink-0">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <PanelSectionHeader
            title="Cooling load vs capacity"
            aside={
              <div className="flex gap-1">
                {[1, 4, 12, 24].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setTimeRangeHours(h)}
                    className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      timeRangeHours === h ? 'border-cyan-400 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            }
          />
          <EngineeringChart>
            <LineChart data={telemetryTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
              <YAxis stroke={CHART_COLORS.axis} fontSize={11} domain={[0, 150]} tickLine={false} unit=" T" />
              <Tooltip content={EngineeringTooltip} />
              <ReferenceLine y={105} stroke="#f59e0b" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="cooling_load_tons" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="Load (T)" />
              <Line type="monotone" dataKey="available_capacity_tons" stroke={CHART_COLORS.optimized} strokeWidth={2} strokeDasharray="4 4" dot={false} name="Capacity (T)" />
            </LineChart>
          </EngineeringChart>
        </div>

        <div className="glass-card p-4">
          <PanelSectionHeader title="Plant power & efficiency trend" aside={<Gauge className="w-4 h-4 text-cyan-800" />} />
          <EngineeringChart>
            <LineChart data={plantTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} />
              <YAxis yAxisId="left" stroke={CHART_COLORS.axis} fontSize={11} domain={[30, 60]} tickLine={false} unit=" kW" />
              <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS.axis} fontSize={11} domain={[0.4, 0.8]} tickLine={false} />
              <Tooltip content={EngineeringTooltip} />
              <Line yAxisId="left" type="monotone" dataKey="plant_power_kw" stroke={CHART_COLORS.current} strokeWidth={2} dot={false} name="Plant kW" />
              <Line yAxisId="right" type="monotone" dataKey="kw_per_ton" stroke={CHART_COLORS.optimized} strokeWidth={2} dot={false} name="kW/T" />
            </LineChart>
          </EngineeringChart>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card overflow-hidden">
          <PanelSectionHeader title="Safety validation" aside={<Activity className="w-4 h-4 text-emerald-700" />} />
          <div className="overflow-x-auto eng-scroll max-h-56">
            <table className="bms-table">
              <thead><tr><th>Check</th><th>Value</th><th>Limit</th><th>Status</th></tr></thead>
              <tbody className="font-mono text-[11px]">
                {(safety?.checks || []).map((chk: any, i: number) => (
                  <tr key={i}>
                    <td className="font-sans">{chk.name}</td>
                    <td>{chk.value}</td>
                    <td className="text-slate-500">{chk.limit}</td>
                    <td><span className={chk.status === 'PASS' ? 'pill-pass' : 'pill-fail'}>{chk.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <PanelSectionHeader title="Live agent activity" aside={<Snowflake className="w-4 h-4 text-cyan-800" />} />
          <div className="overflow-x-auto eng-scroll max-h-56">
            {activities.length === 0 ? (
              <div className="p-6"><TableEmptyState colSpan={3} title="NO ACTIVITY" detail="No O4 events persisted yet." /></div>
            ) : (
              <table className="bms-table">
                <thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead>
                <tbody className="font-mono text-xs">
                  {activities.slice(0, 8).map((act: any, i: number) => (
                    <tr key={i}>
                      <td className="text-slate-600 whitespace-nowrap">{act.time}</td>
                      <td className="font-sans font-medium">{act.event}</td>
                      <td className="font-sans text-slate-700">{act.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </OpportunityWorkspace>
  );
}
