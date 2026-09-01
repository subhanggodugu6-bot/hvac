'use client';

import React, { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { SectionDashboard } from '@/components/hvac/SectionDashboard';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { OMDashboardCharts } from '@/components/hvac/OMDashboardCharts';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import {
  formatKw,
  formatKwh,
  formatKwhMonth,
  formatPercent,
  formatDash,
  formatConfidence,
  formatAgeSeconds,
  formatNumber,
} from '@/lib/hvac/formatters';
import { fetchOmDashboard } from '@/lib/hvac/omApi';
import type { OmDashboardData, OmOpportunity } from '@/lib/hvac/omTypes';
import { displayKpiText } from '@/lib/hvac/omTypes';
import { provenanceFromAgent } from '@/lib/hvac/provenance';
import { MlSectionStrip } from '@/components/hvac/MlSectionStrip';
import { fetchPlatformGate, type PlatformGate } from '@/lib/hvac/o20Api';

function findOpp(data: OmDashboardData | null, id: string): OmOpportunity | undefined {
  return data?.opportunities?.find((o) => o.id === id || o.opportunityId === id);
}

export default function OperationsMaintenanceDashboardPage() {
  const [data, setData] = useState<OmDashboardData | null>(null);
  const [platform, setPlatform] = useState<PlatformGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'OK' | 'API ERROR' | 'NO DATA'>('OK');

  useEffect(() => {
    let cancelled = false;
    let inFlight: AbortController | null = null;
    const load = async () => {
      inFlight?.abort();
      const ac = new AbortController();
      inFlight = ac;
      const r = await fetchOmDashboard(ac.signal);
      if (cancelled || ac.signal.aborted) return;
      setData(r.data);
      setError(r.data ? 'OK' : r.error);
      setLoading(false);
      try {
        const p = await fetchPlatformGate();
        if (!cancelled) setPlatform(p);
      } catch {
        if (!cancelled) setPlatform(null);
      }
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
  const simulated = /SIMUL/i.test(String(tel?.state || tel?.source || ''));
  const connectedCount =
    data?.module?.kpis?.simActiveCount ??
    (simulated
      ? ['O17', 'O18', 'O19', 'O20'].filter((id) => {
          const o = findOpp(data, id);
          return o && !['UNAVAILABLE', 'NO DATA', 'NO LIVE DATA', 'ERROR'].includes(String(o.status || ''));
        }).length
      : null);
  const liveCount = data
    ? simulated
      ? connectedCount
      : kpis?.liveCount != null
        ? kpis.liveCount
        : ['O17', 'O18', 'O19', 'O20'].filter(
            (id) => provenanceFromAgent(findOpp(data, id) as unknown as Record<string, unknown>) === 'LIVE'
          ).length
    : null;
  const bmsLabel = simulated
    ? 'OFFLINE'
    : String(mod?.bms?.status || (mod?.bmsConnected ? 'CONNECTED' : 'OFFLINE')).toUpperCase();
  const telLabel = simulated ? 'SIMULATED' : formatDash(tel?.state);

  const cardStatus = (o?: OmOpportunity) => {
    if (!o) return undefined;
    const st = o.status;
    if (st && !['UNAVAILABLE', 'NO DATA', 'NO LIVE DATA'].includes(st)) return st;
    if (simulated || o.telemetryStatus === 'SIMULATED') return 'SIMULATED';
    return st;
  };

  const cardFields = (id: string) => {
    const o = findOpp(data, id);
    const fields =
      loading && !data
        ? [{ label: 'Current', value: 'LOADING TELEMETRY...' }]
        : id === 'O17'
          ? [
              { label: 'Current', value: formatKw(o?.energy?.currentKw ?? o?.current?.kw) },
              { label: 'Baseline', value: formatKw(o?.energy?.baselineKw ?? o?.current?.baselineKw) },
              { label: 'Target', value: formatKw(o?.energy?.targetKw ?? o?.current?.targetKw) },
              { label: 'Impact', value: formatKw(o?.energy?.savingKw) },
              { label: 'Recommendation', value: formatDash(o?.recommendation?.action) },
              { label: 'Decision', value: formatDash(o?.supervisory?.decision) },
              { label: 'Dispatch', value: formatDash(o?.dispatch?.eligible ? 'READY' : o?.dispatch?.blockCode || o?.dispatch?.status) },
              { label: 'Confidence', value: formatConfidence(o?.confidence) },
            ]
          : id === 'O18'
            ? [
                { label: 'Training items', value: formatDash(o?.current?.trainingItems) },
                { label: 'Affected users', value: formatDash(o?.current?.affectedUsers) },
                { label: 'Completion', value: formatPercent(o?.current?.trainingCoveragePct) },
                { label: 'Readiness', value: formatDash(o?.current?.operatorReadiness) },
                { label: 'Energy impact', value: formatKwh(o?.energy?.impactKwhDay ?? o?.energy?.dailyKwh) },
                { label: 'Recommendation', value: formatDash(o?.recommendation?.action) },
                { label: 'Priority', value: formatDash(o?.priority) },
                { label: 'Confidence', value: formatConfidence(o?.confidence) },
              ]
            : id === 'O19'
              ? [
                  { label: 'Equipment health', value: formatPercent(o?.current?.equipmentHealthPct) },
                  { label: 'Assets at risk', value: formatDash(o?.current?.assetsAtRisk) },
                  { label: 'Findings', value: formatDash(o?.current?.maintenanceAlerts) },
                  { label: 'Risk', value: formatDash(o?.current?.maintenanceRisk) },
                  { label: 'Energy loss', value: formatKw(o?.energy?.impactKw) },
                  { label: 'Recommendation', value: formatDash(o?.recommendation?.action) },
                  { label: 'Priority', value: formatDash(o?.priority) },
                  { label: 'Confidence', value: formatConfidence(o?.confidence) },
                ]
              : [
                  { label: 'Control health', value: formatPercent(o?.current?.controlHealthPct) },
                  { label: 'Control points', value: formatNumber(o?.current?.controlPoints, 0) },
                  { label: 'Healthy', value: formatNumber(o?.current?.healthyPoints, 0) },
                  { label: 'Overrides', value: formatDash(o?.current?.overrides) },
                  { label: 'Drift', value: formatDash(o?.current?.driftCount) },
                  { label: 'Software', value: formatDash(o?.current?.softwareVersion) },
                  { label: 'Recommendation', value: formatDash(o?.recommendation?.action) },
                  { label: 'Confidence', value: formatConfidence(o?.confidence) },
                ];
    return {
      def: getOpportunity(id)!,
      status: loading && !data ? 'LOADING' : error === 'API ERROR' && !data ? 'API ERROR' : cardStatus(o),
      telemetryLabel: o ? provenanceFromAgent(o as unknown as Record<string, unknown>) : undefined,
      fields,
      emptyTitle: error === 'API ERROR' && !data ? 'DATA SOURCE ERROR' : 'NO DATA',
      emptyDetail:
        error === 'API ERROR' ? 'Operations & Maintenance API did not respond.' : 'No usable O&M telemetry for this opportunity.',
      maxFields: 4,
    };
  };

  const energyDetail = [
    displayKpiText(kpis?.energySavingsKw != null ? formatKw(kpis.energySavingsKw) : null),
    displayKpiText(kpis?.energySavingsKwhDay != null ? formatKwh(kpis.energySavingsKwhDay) : null),
    displayKpiText(kpis?.energySavingsKwhMonth != null ? formatKwhMonth(kpis.energySavingsKwhMonth) : null),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SectionDashboard
      title="Operations & Maintenance"
      subtitle="Energy planning, workforce awareness, maintenance efficiency, and HVAC control-system governance. OEH §6"
      icon={Wrench}
      badge="O17–O20"
      chapterId="operations"
      kpiEmptyText={empty}
      kpis={[
        {
          label: 'LIVE opportunities',
          value: liveCount != null ? `${liveCount} / 4` : null,
          status: data ? (simulated ? 'SIMULATED' : telLabel) : null,
          source: tel?.source || null,
          quality: simulated ? 'SIMULATED' : kpis?.dataQuality || null,
        },
        {
          label: 'Active Recommendations',
          value: data && kpis?.activeRecommendations != null ? String(kpis.activeRecommendations) : null,
          status: data ? formatDash(mod?.agentLabel) : null,
          source: tel?.source || null,
          quality: kpis?.dataQuality || null,
        },
        {
          label: 'Energy Savings Potential',
          value: data ? displayKpiText(kpis?.energySavingsKw != null ? formatKw(kpis.energySavingsKw) : energyDetail || null) : null,
          detail: energyDetail || null,
          status: data ? formatDash(kpis?.safety) : null,
          source: tel?.source || null,
          quality: kpis?.dataQuality || null,
        },
        {
          label: 'Maintenance Priority',
          value: loading && !data ? null : displayKpiText(kpis?.maintenancePriority),
          status: data ? formatDash(kpis?.maintenanceRisk) : null,
          source: tel?.source || null,
          quality: kpis?.dataQuality || null,
        },
        {
          label: 'Control Health',
          value: data ? formatPercent(kpis?.controlHealthPct ?? findOpp(data, 'O20')?.current?.controlHealthPct) : null,
          status: data ? formatDash(findOpp(data, 'O20')?.current?.controllerHealth) : null,
          source: tel?.source || null,
          quality: kpis?.dataQuality || null,
        },
      ]}
      cards={[cardFields('O17'), cardFields('O18'), cardFields('O19'), cardFields('O20')]}
    >
      <MlSectionStrip opportunityIds={['O17', 'O18', 'O19', 'O20']} />
      <div className="flex flex-wrap gap-2 text-[11px] font-mono -mt-2">
        <StatusBadge tone={toneForStatus(bmsLabel)}>BMS {formatDash(bmsLabel)}</StatusBadge>
        <StatusBadge tone={toneForStatus(telLabel)}>TELEMETRY {telLabel}</StatusBadge>
        <StatusBadge tone={toneForStatus(mod?.agentStatus)}>AGENTS {formatDash(mod?.agentLabel || mod?.agentStatus)}</StatusBadge>
        <StatusBadge tone="neutral">MODE {formatDash(mod?.mode)}</StatusBadge>
        <StatusBadge tone={platform?.safeMode ? 'danger' : 'muted'}>SAFE MODE {platform?.safeMode ? 'ON' : 'OFF'}</StatusBadge>
        <StatusBadge tone={toneForStatus(mod?.safetyStatus)}>SAFETY {formatDash(mod?.safetyStatus)}</StatusBadge>
        <StatusBadge tone={toneForStatus(kpis?.dataQuality)}>DATA {formatDash(kpis?.dataQuality)}</StatusBadge>
        <StatusBadge tone="muted">UPDATED {formatAgeSeconds(tel?.ageSeconds)}</StatusBadge>
        {platform?.buildingName ? <StatusBadge tone="muted">{platform.buildingName}</StatusBadge> : null}
      </div>
      {data ? <OMDashboardCharts data={data} /> : null}
    </SectionDashboard>
  );
}
