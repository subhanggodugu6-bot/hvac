'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, ShieldCheck, Zap } from 'lucide-react';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { KPIGrid } from '@/components/hvac/KPIGrid';
import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import {
  formatCfm,
  formatKw,
  formatKwh,
  formatPercent,
  formatPpm,
  formatDash,
  formatTemperature,
  formatAgeSeconds,
} from '@/lib/hvac/formatters';
import { fetchVentilationOpportunity, postVentilationAction } from '@/lib/hvac/ventilationApi';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';
import { metricNum, metricStr } from '@/lib/hvac/ventilationTypes';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { actionErrorText } from '@/lib/hvac/actionError';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-xs font-mono border-b border-slate-200">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 text-right">{value}</span>
    </div>
  );
}

export function VentilationDetailView({ opportunityId }: { opportunityId: 'O10' | 'O11' | 'O12' | 'O13' }) {
  const def = getOpportunity(opportunityId)!;
  const [data, setData] = useState<VentilationOpportunity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const r = await fetchVentilationOpportunity(opportunityId, signal);
    if (signal?.aborted) return;
    if (r.data) {
      setData(r.data);
      setError(null);
    } else {
      setData(null);
      setError(r.error === 'API ERROR' ? 'DATA SOURCE ERROR' : 'NO DATA');
    }
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => {
    let cancelled = false;
    let inFlight: AbortController | null = null;
    const tick = async () => {
      inFlight?.abort();
      const ac = new AbortController();
      inFlight = ac;
      await load(ac.signal);
      if (cancelled) return;
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      inFlight?.abort();
      window.clearInterval(id);
    };
  }, [load]);

  const m = data?.metrics;
  const damperMode = opportunityId === 'O10';
  const fmtSet = damperMode ? formatPercent : formatCfm;
  const kpis =
    opportunityId === 'O10'
      ? [
          { label: 'Current damper', value: data ? formatPercent(data.current?.damperPct) : null },
          { label: 'Optimized damper', value: data ? formatPercent(data.optimized?.damperPct) : null },
          { label: 'OA airflow', value: data ? formatCfm(data.current?.airflowCfm) : null },
          { label: 'Energy Impact', value: data ? formatKw(data.energy?.savingKw ?? data.energy?.instantaneousKw) : null },
          { label: 'Confidence', value: data ? formatPercent(data.confidence) : null },
          { label: 'Safety', value: data ? formatDash(data.safety?.status) : null },
        ]
      : opportunityId === 'O11'
      ? [
          { label: 'Current', value: data ? formatCfm(data.current?.airflowCfm) : null },
          { label: 'Optimized', value: data ? formatCfm(data.optimized?.airflowCfm) : null },
          { label: 'Airflow Delta', value: data ? formatCfm(data.delta?.airflowCfm) : null },
          { label: 'Energy Impact', value: data ? formatKw(data.energy?.savingKw ?? data.energy?.instantaneousKw) : null },
          { label: 'Confidence', value: data ? formatPercent(data.confidence) : null },
          { label: 'Safety', value: data ? formatDash(data.safety?.status) : null },
        ]
      : opportunityId === 'O12'
        ? [
            { label: 'Current OA', value: data ? formatCfm(data.current?.airflowCfm) : null },
            { label: 'Optimized OA', value: data ? formatCfm(data.optimized?.airflowCfm) : null },
            { label: 'CO₂', value: data ? formatPpm(data.current?.co2Ppm) : null },
            { label: 'Energy', value: data ? formatKw(data.energy?.savingKw ?? data.energy?.instantaneousKw) : null },
            { label: 'Confidence', value: data ? formatPercent(data.confidence) : null },
            { label: 'Safety', value: data ? formatDash(data.safety?.status) : null },
          ]
        : [
            { label: 'Current exhaust', value: data ? formatCfm(data.current?.airflowCfm) : null },
            { label: 'Optimized', value: data ? formatCfm(data.optimized?.airflowCfm) : null },
            { label: 'CO', value: data ? formatPpm(data.current?.coPpm) : null },
            { label: 'Energy', value: data ? formatKw(data.energy?.savingKw ?? data.energy?.instantaneousKw) : null },
            { label: 'Confidence', value: data ? formatPercent(data.confidence) : null },
            { label: 'Safety', value: data ? formatDash(data.safety?.status) : null },
          ];

  const kj = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)} kJ/kg`);
  const engineering =
    opportunityId === 'O10'
      ? [
          ['Outdoor drybulb', formatTemperature(metricNum(m, 'outdoor_drybulb_c'))],
          ['Return drybulb', formatTemperature(metricNum(m, 'return_drybulb_c'))],
          ['Outdoor humidity', formatPercent(metricNum(m, 'outdoor_rh_pct'))],
          ['Return humidity', formatPercent(metricNum(m, 'return_rh_pct'))],
          ['Outdoor enthalpy', kj(metricNum(m, 'outdoor_enthalpy_kj_kg'))],
          ['Return enthalpy', kj(metricNum(m, 'return_enthalpy_kj_kg'))],
          ['Enthalpy advantage', kj(metricNum(m, 'enthalpy_advantage_kj_kg'))],
          ['Economizer mode', formatDash(metricStr(m, 'economizer_status'))],
          ['OA damper current / rec', `${formatPercent(data?.current?.damperPct)} / ${formatPercent(data?.optimized?.damperPct)}`],
          ['OA airflow current', formatCfm(data?.current?.airflowCfm)],
          ['OA airflow recommended', formatCfm(data?.optimized?.airflowCfm)],
          ['Free cooling', formatKw(metricNum(m, 'free_cooling_kw'))],
          ['Fan power', formatKw(data?.energy?.currentKw)],
        ]
      : opportunityId === 'O11'
      ? [
          ['Outdoor temperature', formatTemperature(metricNum(m, 'outdoor_temperature_c'))],
          ['Zone temperature', formatTemperature(metricNum(m, 'zone_temperature_c'))],
          ['Outdoor humidity', formatPercent(metricNum(m, 'outdoor_rh_percent'))],
          ['Indoor humidity', formatPercent(metricNum(m, 'indoor_rh_percent'))],
          ['Current airflow', formatCfm(data?.current?.airflowCfm)],
          ['Occupancy', formatDash(metricStr(m, 'occupancy_state'))],
          ['Eligibility', formatDash(metricStr(m, 'eligibility'))],
          ['Purge window', formatDash(metricStr(m, 'purge_window'))],
          ['Thermal opportunity', formatDash(metricStr(m, 'thermal_opportunity'))],
          ['Fan power', formatKw(data?.energy?.currentKw)],
          ['Pre-cooling benefit', formatKwh(metricNum(m, 'estimated_cooling_benefit_kwh'), false)],
        ]
      : opportunityId === 'O12'
        ? [
            ['Zone CO₂', formatPpm(data?.current?.co2Ppm)],
            ['Outdoor CO₂', formatPpm(metricNum(m, 'outdoor_co2_ppm'))],
            ['CO₂ setpoint', formatPpm(metricNum(m, 'co2_target_ppm'))],
            ['Projected CO₂', formatPpm(data?.optimized?.co2Ppm)],
            ['Occupancy', formatDash(data?.current?.occupancy)],
            ['Design occupancy', formatDash(metricNum(m, 'design_occupant_count'))],
            ['Occupancy %', formatPercent(metricNum(m, 'occupancy_pct'))],
            ['Outdoor airflow', formatCfm(data?.current?.airflowCfm)],
            ['Required ventilation', formatCfm(metricNum(m, 'required_ventilation_cfm'))],
            ['Damper current / rec', `${formatPercent(data?.current?.damperPct)} / ${formatPercent(data?.optimized?.damperPct)}`],
            ['Zone temperature', formatTemperature(metricNum(m, 'zone_temperature_c'))],
            ['Zone humidity', formatPercent(metricNum(m, 'zone_humidity_percent'))],
            ['Ventilation compliance', formatDash(metricStr(m, 'iaq_compliance'))],
            ['Energy impact', formatKw(data?.energy?.instantaneousKw)],
          ]
        : [
            ['CO concentration', formatPpm(data?.current?.coPpm)],
            ['CO threshold', formatPpm(metricNum(m, 'co_limit_ppm'))],
            ['CO safety margin', `${formatPpm(metricNum(m, 'co_margin_ppm'))} / ${formatPercent(metricNum(m, 'co_margin_pct'))}`],
            ['Exhaust / return', formatCfm(data?.current?.airflowCfm)],
            ['Optimized exhaust', formatCfm(data?.optimized?.airflowCfm)],
            ['Fan / damper current', formatPercent(data?.current?.damperPct)],
            ['Fan / damper recommended', formatPercent(data?.optimized?.damperPct)],
            ['Envelope differential', formatDash(metricNum(m, 'differential_pressure_pa') ?? metricNum(m, 'envelope_dp_pa'))],
            ['Zone temperature', formatTemperature(metricNum(m, 'zone_temperature_c'))],
            ['Zone humidity', formatPercent(metricNum(m, 'zone_humidity_percent'))],
            ['Energy impact', formatKw(data?.energy?.instantaneousKw)],
            ['Daily energy', formatKwh(data?.energy?.dailyKwh)],
          ];

  return (
    <OpportunityWorkspace
      def={def}
      live={provenanceFromAgent(data as Record<string, unknown> | null)}
      bms={data?.bmsConnected ? 'CONNECTED' : 'OFFLINE'}
      actions={
        <button
          className="btn-danger"
          onClick={async () => {
            setActionError(null);
            try {
              await postVentilationAction(opportunityId, 'rollback');
              setAction('ROLLED BACK');
              load();
            } catch (e) {
              setActionError(actionErrorText(e, 'Rollback failed'));
            }
            setTimeout(() => setAction(null), 4000);
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Fail-Safe Rollback
        </button>
      }
    >
      <div className="flex flex-wrap gap-2 text-[11px] font-mono -mt-2">
        <StatusBadge tone={toneForStatus(data?.telemetry?.state)}>TEL {formatDash(data?.telemetry?.state)}</StatusBadge>
        <StatusBadge tone="muted">UPDATED {formatAgeSeconds(data?.telemetry?.ageSeconds)}</StatusBadge>
        <StatusBadge tone={toneForStatus(data?.supervisory?.decision)}>{formatDash(data?.supervisory?.decision)}</StatusBadge>
        <StatusBadge tone={toneForStatus(data?.safety?.status)}>SAFETY {formatDash(data?.safety?.status)}</StatusBadge>
      </div>

      {loading && !data ? (
        <p className="text-[11px] font-mono text-slate-500">Loading {opportunityId} telemetry…</p>
      ) : null}
      {error && !data && !loading && (
        <EmptyState title={error} detail="No fabricated Current/Optimized values are shown while the data source is unavailable." />
      )}

      <KPIGrid emptyText="—" items={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="kpi-tile">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Recommendation</div>
            <div className="text-lg font-mono text-cyan-800 mt-2">{formatDash(data?.recommendation?.action)}</div>
            <p className="text-sm text-slate-700 mt-2">{formatDash(data?.recommendation?.rationale)}</p>
            <div className="mt-3 space-y-0">
              <Row label="Current" value={fmtSet(data?.recommendation?.current)} />
              <Row label="Recommended" value={fmtSet(data?.recommendation?.recommended)} />
              <Row label="Expected impact" value={formatKw(data?.recommendation?.expectedImpactKw)} />
              <Row label="Confidence" value={formatPercent(data?.recommendation?.confidence)} />
              <Row label="Safety" value={formatDash(data?.recommendation?.safety)} />
              <Row label="Timestamp" value={formatDash(data?.recommendation?.timestamp)} />
            </div>
          </div>

          <div className="kpi-tile">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Supervisory Decision
            </div>
            <div className="text-lg font-mono text-emerald-800 mt-2">{formatDash(data?.supervisory?.decision)}</div>
            <p className="text-sm text-slate-700 mt-2">{formatDash(data?.supervisory?.reason)}</p>
            <div className="mt-3 space-y-0">
              <Row label={damperMode ? 'Current damper' : 'Current airflow'} value={fmtSet(data?.supervisory?.current)} />
              <Row label={damperMode ? 'Recommended damper' : 'Recommended airflow'} value={fmtSet(data?.supervisory?.recommended)} />
              <Row label="Delta" value={fmtSet(data?.supervisory?.delta)} />
              <Row label="Confidence" value={formatPercent(data?.supervisory?.confidence)} />
              <Row label="Safety guardrail" value={formatDash(data?.supervisory?.safety)} />
              <Row label="Dispatch" value={formatDash(data?.dispatch?.status)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={!data?.dispatch?.eligible}
                onClick={async () => {
                  if (!data) return;
                  setAction('DISPATCHING');
                  setActionError(null);
                  try {
                    await postVentilationAction(opportunityId, 'dispatch', {
                      target_value: damperMode ? data.optimized?.damperPct : data.optimized?.airflowCfm,
                    });
                    setAction('DISPATCHED');
                    load();
                  } catch (e) {
                    setAction('BLOCKED');
                    setActionError(actionErrorText(e, 'Dispatch failed'));
                  }
                  setTimeout(() => setAction(null), 4000);
                }}
              >
                <Zap className="w-3.5 h-3.5" />
                {action || 'Dispatch Recommendation'}
              </button>
              <button
                className="btn-secondary"
                onClick={async () => {
                  setActionError(null);
                  try {
                    await postVentilationAction(opportunityId, 'verify');
                    setAction('VERIFIED');
                    load();
                  } catch (e) {
                    setActionError(actionErrorText(e, 'Verification failed'));
                  }
                  setTimeout(() => setAction(null), 4000);
                }}
              >
                Verify
              </button>
              <StatusBadge tone={toneForStatus(data?.dispatch?.status)}>{formatDash(data?.dispatch?.status)}</StatusBadge>
            </div>
            {(actionError || data?.dispatch?.blockReason) && (
              <div className="mt-3 text-xs text-rose-800 border border-rose-500/30 bg-rose-950/40 rounded-lg px-3 py-2">
                {actionError || `${data?.dispatch?.blockCode || 'DISPATCH_BLOCKED'}: ${data?.dispatch?.blockReason}`}
              </div>
            )}
            <div className="mt-3 space-y-0">
              <Row label="Command" value={formatDash(data?.dispatch?.command)} />
              <Row label="Target" value={fmtSet(data?.dispatch?.target)} />
              <Row label="Source" value={formatDash(data?.dispatch?.source)} />
              <Row label="Verification" value={formatDash(data?.dispatch?.verification)} />
              <Row label="Timestamp" value={formatDash(data?.dispatch?.timestamp)} />
            </div>
          </div>
        </div>

      <div className="kpi-tile">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Fail-Safe Rollback</div>
        <div className="text-lg font-mono text-amber-800 mt-2">{formatDash(data?.failSafe?.policy)}</div>
        <div className="mt-3 space-y-0">
          <Row label="Previous state" value={fmtSet(data?.failSafe?.previous)} />
          <Row label="Recommended state" value={fmtSet(data?.failSafe?.recommended)} />
          <Row label="Dispatch state" value={formatDash(data?.failSafe?.dispatch)} />
          <Row label="Rollback state" value={fmtSet(data?.failSafe?.rollback)} />
          <Row label="Rollback available" value={data?.failSafe?.available ? 'YES' : '—'} />
        </div>
      </div>

      <div className="kpi-tile">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Engineering Inputs</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          {engineering.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>
      </div>
    </OpportunityWorkspace>
  );
}
