'use client';

import React, { useEffect, useState } from 'react';
import { Wind } from 'lucide-react';
import { SectionDashboard } from '@/components/hvac/SectionDashboard';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { formatCfm, formatKw, formatPercent, formatPpm, formatDash } from '@/lib/hvac/formatters';
import { fetchVentilationDashboard } from '@/lib/hvac/ventilationApi';
import type { VentilationDashboardData, VentilationOpportunity } from '@/lib/hvac/ventilationTypes';
import { metricStr } from '@/lib/hvac/ventilationTypes';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { MlSectionStrip } from '@/components/hvac/MlSectionStrip';

function findOpp(data: VentilationDashboardData | null, id: string): VentilationOpportunity | undefined {
  return data?.opportunities?.find((o) => o.id === id || o.opportunityId === id);
}

export default function VentilationAirflowDashboardPage() {
  const [data, setData] = useState<VentilationDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'OK' | 'API ERROR' | 'NO DATA'>('OK');

  useEffect(() => {
    let cancelled = false;
    let inFlight: AbortController | null = null;
    const load = async () => {
      inFlight?.abort();
      const ac = new AbortController();
      inFlight = ac;
      const r = await fetchVentilationDashboard(ac.signal);
      if (cancelled || ac.signal.aborted) return;
      setData(r.data);
      setError(r.data ? 'OK' : r.error);
      setLoading(false);
    };
    load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      inFlight?.abort();
      window.clearInterval(id);
    };
  }, []);

  const empty = loading ? 'LOADING TELEMETRY...' : error === 'API ERROR' ? 'DATA SOURCE ERROR' : 'NO DATA';
  const mod = data?.module;
  const kpis = mod?.kpis;
  const tel = mod?.telemetry;

  const cardFields = (id: string) => {
    const o = findOpp(data, id);
    const m = o?.metrics;
    const fields =
      loading && !data
        ? [{ label: 'Current', value: 'LOADING TELEMETRY...' }]
            : id === 'O10'
            ? [
                { label: 'OA damper', value: formatPercent(o?.current?.damperPct) },
                { label: 'Optimized damper', value: formatPercent(o?.optimized?.damperPct) },
                { label: 'Economizer', value: metricStr(m, 'economizer_status') },
                { label: 'Enthalpy Δ', value: metricStr(m, 'enthalpy_advantage_kj_kg') },
                { label: 'Safety', value: formatDash(o?.safety?.status) },
                { label: 'Dispatch', value: formatDash(o?.dispatch?.eligible ? 'READY' : o?.dispatch?.blockCode) },
              ]
            : id === 'O11'
            ? [
                { label: 'Current', value: formatCfm(o?.current?.airflowCfm) },
                { label: 'Optimized', value: formatCfm(o?.optimized?.airflowCfm) },
                { label: 'Delta', value: formatCfm(o?.delta?.airflowCfm) },
                { label: 'Energy', value: formatKw(o?.energy?.savingKw ?? o?.energy?.instantaneousKw) },
                { label: 'Confidence', value: formatPercent(o?.confidence) },
                { label: 'Eligibility', value: metricStr(m, 'eligibility') },
                { label: 'Safety', value: formatDash(o?.safety?.status) },
              ]
            : id === 'O12'
              ? [
                  { label: 'Current', value: formatCfm(o?.current?.airflowCfm) },
                  { label: 'Optimized', value: formatCfm(o?.optimized?.airflowCfm) },
                  { label: 'CO₂', value: formatPpm(o?.current?.co2Ppm) },
                  { label: 'Occupancy', value: o?.current?.occupancy != null ? String(o.current.occupancy) : '—' },
                  { label: 'Energy', value: formatKw(o?.energy?.savingKw ?? o?.energy?.instantaneousKw) },
                  { label: 'Confidence', value: formatPercent(o?.confidence) },
                  { label: 'Safety', value: formatDash(metricStr(m, 'iaq_compliance') || o?.safety?.status) },
                ]
              : [
                  { label: 'Current', value: formatCfm(o?.current?.airflowCfm) },
                  { label: 'Optimized', value: formatCfm(o?.optimized?.airflowCfm) },
                  { label: 'CO', value: formatPpm(o?.current?.coPpm) },
                  { label: 'Exhaust Δ', value: formatCfm(o?.delta?.airflowCfm) },
                  { label: 'Energy', value: formatKw(o?.energy?.savingKw ?? o?.energy?.instantaneousKw) },
                  { label: 'Confidence', value: formatPercent(o?.confidence) },
                  { label: 'Safety', value: formatDash(o?.safety?.status) },
                ];
    return {
      def: getOpportunity(id)!,
      status: loading && !data ? 'LOADING' : error === 'API ERROR' && !data ? 'API ERROR' : o?.status,
      telemetryLabel: o ? provenanceFromAgent(o as unknown as Record<string, unknown>) : undefined,
      fields,
      emptyTitle: error === 'API ERROR' && !data ? 'DATA SOURCE ERROR' : 'NO DATA',
      emptyDetail:
        error === 'API ERROR'
          ? 'Ventilation API did not respond.'
          : 'No usable telemetry for this opportunity.',
      maxFields: 4,
    };
  };

  return (
    <SectionDashboard
      title="Ventilation & Air Flow Optimizations"
      subtitle="Economy-cycle free cooling, demand-controlled ventilation, and night-time thermal purge. OEH §4"
      icon={Wind}
      badge="O10–O13"
      chapterId="ventilation"
      kpiEmptyText={empty}
      kpis={[
        { label: 'Provenance', value: loading && !data ? null : tel?.state || null, detail: tel?.source || null },
        { label: 'LIVE opportunities', value: data && kpis?.liveCount != null ? `${kpis.liveCount} / 4` : data ? `${['O10', 'O11', 'O12', 'O13'].filter((id) => provenanceFromAgent(findOpp(data, id) as unknown as Record<string, unknown>) === 'LIVE').length} / 4` : null },
        {
          label: 'Airflow Optimization',
          value: data ? `${formatCfm(kpis?.currentAirflowCfm)} → ${formatCfm(kpis?.optimizedAirflowCfm)}` : null,
        },
        {
          label: 'Energy Impact',
          value: data && kpis?.savingsKw != null ? formatKw(kpis.savingsKw) : data ? formatKw(kpis?.currentKw) : null,
          detail:
            kpis?.currentKw != null || kpis?.optimizedKw != null
              ? `${formatKw(kpis?.currentKw)} → ${formatKw(kpis?.optimizedKw)}`
              : null,
        },
        { label: 'Safety / Compliance', value: loading && !data ? null : kpis?.safety || null },
      ]}
      cards={[cardFields('O10'), cardFields('O11'), cardFields('O12'), cardFields('O13')]}
    >
      <MlSectionStrip opportunityIds={['O10', 'O11', 'O12', 'O13']} />
      <div className="flex flex-wrap gap-2 text-[11px] font-mono -mt-2">
        <StatusBadge tone={toneForStatus(mod?.bms?.status)}>BMS {formatDash(mod?.bms?.status)}</StatusBadge>
        <StatusBadge tone={toneForStatus(tel?.state)}>TEL {formatDash(tel?.state)}</StatusBadge>
        <StatusBadge tone={toneForStatus(mod?.agentStatus)}>AGENT {formatDash(mod?.agentStatus)}</StatusBadge>
        <StatusBadge tone="neutral">MODE {formatDash(mod?.mode)}</StatusBadge>
        <StatusBadge tone={toneForStatus(mod?.safetyStatus)}>SAFETY {formatDash(mod?.safetyStatus)}</StatusBadge>
        <StatusBadge tone="muted">UPDATED {formatDash(tel?.lastUpdated)}</StatusBadge>
      </div>
    </SectionDashboard>
  );
}
