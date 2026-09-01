'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { telemetrySocket } from '@/lib/hvac/telemetrySocket';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';
import type { TelemetryEvent, TelemetryFrame } from '@/lib/hvac/telemetrySocket';
import {
  fetchPlatformStatus,
  fetchPlatformTelemetry,
  platformKeys,
  STATUS_STALE_MS,
} from '@/lib/hvac/platformQueries';

function statusToFrame(
  status: Record<string, unknown>,
  telBody: { points?: Record<string, unknown>[] },
): TelemetryFrame {
  const events: TelemetryEvent[] = (telBody.points || []).map((p) => {
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
  const bms = status.bms && typeof status.bms === 'object' ? status.bms : { status: status.bmsStatus };
  const telemetry =
    status.telemetry && typeof status.telemetry === 'object' ? status.telemetry : { status: status.telemetry };
  return {
    bms: bms as TelemetryFrame['bms'],
    telemetry: telemetry as TelemetryFrame['telemetry'],
    safeMode: Boolean(status.safeMode),
    plantMode: (status.plantMode as string) || null,
    controlEnabled: Boolean(status.controlEnabled),
    controlLabel: String(status.controlLabel || (status.controlEnabled ? 'WRITE ENABLED' : 'WRITE DISABLED')),
    events,
  };
}

export function LiveTelemetryProvider({ children }: { children: React.ReactNode }) {
  const applyFrame = useLiveTelemetry((s) => s.applyFrame);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub = telemetrySocket.subscribe((frame, state) => {
      applyFrame(frame, state);
    });
    let cancelled = false;
    const poll = async () => {
      const open = useLiveTelemetry.getState().connectionState === 'open';
      if (open) return;
      try {
        const status = await queryClient.fetchQuery({
          queryKey: platformKeys.status,
          queryFn: fetchPlatformStatus,
          staleTime: STATUS_STALE_MS,
        });
        const telBody = await queryClient.fetchQuery({
          queryKey: platformKeys.telemetry,
          queryFn: fetchPlatformTelemetry,
          staleTime: STATUS_STALE_MS,
        });
        if (!cancelled) {
          applyFrame(statusToFrame(status, telBody), useLiveTelemetry.getState().connectionState);
        }
      } catch {
        /* keep last frame */
      }
    };
    poll();
    const id = window.setInterval(poll, STATUS_STALE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsub();
    };
  }, [applyFrame, queryClient]);

  return children;
}
