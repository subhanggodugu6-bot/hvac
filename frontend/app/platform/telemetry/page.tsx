'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { hvacFetch } from '@/lib/api/client';
import { LIVE_POLL_MS } from '@/lib/hvac/poll';
import { EmptyState } from '@/components/hvac/EmptyState';
import { displayValue, useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';

export default function TelemetryPage() {
  const live = useLiveTelemetry();
  const rest = useQuery({
    queryKey: ['platform-telemetry-latest'],
    queryFn: async () => (await hvacFetch('/api/platform/telemetry')).json(),
    refetchInterval: live.connectionState === 'open' ? false : LIVE_POLL_MS,
  });
  const events = live.events.length ? live.events : (rest.data?.points || []).map((p: Record<string, unknown>) => {
    const pid = String(p.point_id || '');
    return {
      equipment_id: (p.equipment_id as string) || (pid.includes('.') ? pid.split('.')[0] : null),
      point: pid.includes('.') ? pid.split('.').slice(1).join('.') : pid,
      point_id: pid,
      value: (p.value as number | null) ?? null,
      unit: (p.unit as string) || null,
      quality: (p.quality as string) || null,
      source: (p.source as string) || null,
      timestamp: (p.timestamp as string) || null,
    };
  });
  const wsLabel =
    live.connectionState === 'open' ? 'WS OPEN' : live.connectionState === 'connecting' ? 'WS CONNECTING' : 'WS CLOSED · REST FALLBACK';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader icon={Activity} title="Telemetry" subtitle="Canonical points from the FastAPI stream. Simulation stamps SIMULATION, never LIVE_BMS." badge="CANONICAL" />
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={toneForStatus(live.bmsStatus)}>BMS {live.bmsStatus}</StatusBadge>
        <StatusBadge tone={toneForStatus(live.telemetryStatus)}>TELEMETRY {live.telemetryStatus}</StatusBadge>
        <StatusBadge tone={live.connectionState === 'open' ? 'live' : 'warn'} pulse={live.connectionState === 'open'}>
          {wsLabel}
        </StatusBadge>
        <StatusBadge tone={live.controlEnabled ? 'warn' : 'muted'} pulse={false}>
          {live.controlLabel || (live.controlEnabled ? 'WRITE ENABLED' : 'WRITE DISABLED')}
        </StatusBadge>
      </div>
      {events.length === 0 ? (
        <EmptyState
          title="NO DATA"
          detail="No canonical points yet. With HVAC_USE_SIMULATION=1 the API publishes a synthetic plant on each request."
          href="/platform/bms"
          actionLabel="Open BMS mapping"
        />
      ) : (
        <div className="glass-card overflow-x-auto max-h-[70vh]">
          <table className="bms-table">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Canonical Point</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Quality</th>
                <th>Source</th>
                <th>Timestamp</th>
                <th>BMS</th>
              </tr>
            </thead>
            <tbody>
              {events.map((p: { equipment_id?: string | null; point?: string | null; point_id?: string | null; value?: number | null; unit?: string | null; quality?: string | null; source?: string | null; timestamp?: string | null }, i: number) => {
                const pid = String(p.point_id || `${p.equipment_id}.${p.point}` || i);
                const q = String(p.quality || '').toUpperCase();
                const shown = p.value == null || q === 'BAD' ? 'NO DATA' : displayValue(p.value);
                return (
                  <tr key={pid + String(p.timestamp || i)}>
                    <td className="font-mono text-slate-800">{p.equipment_id || '—'}</td>
                    <td className="font-mono">{p.point || '—'}</td>
                    <td className={q === 'GOOD' ? 'text-emerald-800' : q === 'STALE' ? 'text-amber-300' : q === 'BAD' ? 'text-rose-800' : 'text-slate-400'}>{shown}</td>
                    <td>{p.unit || '—'}</td>
                    <td>{p.quality || '—'}</td>
                    <td>{p.source || '—'}</td>
                    <td className="text-slate-500">{p.timestamp || '—'}</td>
                    <td>{live.bmsStatus}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
