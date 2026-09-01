'use client';

import React from 'react';
import { KPIGrid } from '@/components/hvac/KPIGrid';

interface TopKPIsProps {
  data?: any;
  backendOffline?: boolean;
}

export const TopKPIs: React.FC<TopKPIsProps> = ({ data, backendOffline }) => {
  const miss = backendOffline ? 'BACKEND OFFLINE' : 'AWAITING TELEMETRY';
  return (
    <KPIGrid
      emptyText={miss}
      items={[
        {
          label: 'Agent Health',
          value: data?.agentHealth ?? null,
          detail: data ? `${data.engineHealth || ''} · ${data.databaseHealth || ''} · ${data.bmsConnectivity || ''}` : null,
        },
        {
          label: 'Active Opportunities',
          value: data?.activeOpportunitiesLabel ?? null,
          detail: data?.telemetryFreshness
            ? `Freshness ${data.telemetryFreshness}`
            : data
              ? 'Provenance from agent payload — not assumed LIVE'
              : null,
        },
        {
          label: 'Actions Dispatched',
          value: data?.actionsDispatched != null ? String(data.actionsDispatched) : null,
          detail: 'Persisted BMS command records',
        },
        {
          label: 'Verified Savings',
          value: data?.verifiedSavings ?? null,
          detail: data?.verifiedSavings ? 'VERIFIED records' : 'VERIFIED records only',
        },
        {
          label: 'Comfort Compliance',
          value: data?.comfortCompliance ?? null,
          detail: 'Zones in 20.0–24.5°C',
        },
        {
          label: 'Safety Guardrails',
          value: data?.safetyGuardrails ?? null,
          detail: data?.safetyFailCount != null ? `${data.safetyFailCount} failures` : null,
        },
        {
          label: 'Telemetry Heartbeat',
          value: data?.telemetryHeartbeat != null ? `${Math.round(data.telemetryHeartbeat)}s` : null,
          detail: data?.telemetryFreshness || null,
        },
        {
          label: 'Safety Rollbacks',
          value: data?.safetyRollbacks != null ? String(data.safetyRollbacks) : null,
        },
      ]}
    />
  );
};
