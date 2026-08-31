'use client';

import { useEffect } from 'react';
import { telemetrySocket } from '@/lib/hvac/telemetrySocket';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';
import type { TelemetryEvent, TelemetryFrame } from '@/lib/hvac/telemetrySocket';

import { apiJson } from '@/lib/api/client';

async function restFrame(): Promise<TelemetryFrame | null> {
  try {
    const [status, telBody] = await Promise.all([
      apiJson('/platform/status'),
      apiJson('/platform/telemetry').catch(() => ({ points: [] })),
    ]);
    if (!status) return null;
    const events: TelemetryEvent[] = (telBody.points || []).map((p: Record<string, unknown>) => {
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
    const telemetry = status.telemetry && typeof status.telemetry === 'object' ? status.telemetry : { status: status.telemetry };
    return {
      bms,
      telemetry,
      safeMode: Boolean(status.safeMode),
      plantMode: status.plantMode || null,
        controlEnabled: Boolean(status.controlEnabled),
      events,
    };
  } catch {
    return null;
  }
}

export function LiveTelemetryProvider({ children }: { children: React.ReactNode }) {
  const applyFrame = useLiveTelemetry((s) => s.applyFrame);

  useEffect(() => {
    const unsub = telemetrySocket.subscribe((frame, state) => {
      applyFrame(frame, state);
    });
    let cancelled = false;
    const poll = async () => {
      const open = useLiveTelemetry.getState().connectionState === 'open';
      if (open) return;
      const frame = await restFrame();
      if (!cancelled && frame) applyFrame(frame, useLiveTelemetry.getState().connectionState);
    };
    poll();
    const id = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsub();
    };
  }, [applyFrame]);

  return children;
}
