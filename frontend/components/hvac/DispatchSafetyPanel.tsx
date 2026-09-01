'use client';

import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { hvacFetch } from '@/lib/api/client';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';

const CHECKS: { key: string; okLabel: string; failLabel: string }[] = [
  { key: 'bms_connected', okLabel: 'BMS CONNECTED', failLabel: 'BMS DISCONNECTED' },
  { key: 'telemetry_live', okLabel: 'LIVE_BMS', failLabel: 'TELEMETRY NOT LIVE' },
  { key: 'quality_good', okLabel: 'QUALITY GOOD', failLabel: 'QUALITY NOT GOOD' },
  { key: 'fresh', okLabel: 'TELEMETRY FRESH', failLabel: 'TELEMETRY STALE' },
];

export function DispatchSafetyPanel({
  opportunityId,
  currentValue,
  targetValue,
  confidence,
  decision = 'OPTIMIZE',
  pointId,
  equipmentId,
}: {
  opportunityId: string;
  currentValue?: number | null;
  targetValue?: number | null;
  confidence?: number | null;
  decision?: string;
  pointId?: string | null;
  equipmentId?: string | null;
}) {
  const live = useLiveTelemetry();
  const [commandId, setCommandId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dataset = live.plantMode === 'DATASET';
  const q = useQuery({
    queryKey: ['dispatch-safety', opportunityId, currentValue, targetValue, confidence],
    queryFn: async () => {
      const res = await hvacFetch('/api/platform/safety/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          opportunity_id: opportunityId,
          current_value: currentValue ?? undefined,
          target_value: targetValue ?? undefined,
          confidence: confidence ?? undefined,
          decision,
        }),
      });
      return res.json();
    },
    refetchInterval: 15000,
  });
  const data = q.data || {};
  const checks = (data.checks || {}) as Record<string, boolean>;
  const code = String(data.code || (live.controlEnabled ? 'DISPATCH_OK' : 'WRITE_DISABLED'));
  const oid = opportunityId.toUpperCase();
  const special =
    oid === 'O18' ? 'ADVISORY' : oid === 'O19' ? 'MAINTENANCE_ONLY' : oid === 'O20' ? 'REVIEW_REQUIRED' : code;
  const reason = String(data.reason || 'Supervised writes require Live BMS, mapping, and write-enable.');
  const canWrite = Boolean(data.allowed) && live.controlEnabled && !dataset && !live.safeMode;
  const writesOn = Boolean(checks.write_enabled) || live.controlEnabled;

  const apply = useMutation({
    mutationFn: async () => {
      const res = await hvacFetch('/api/platform/commands/apply', {
        method: 'POST',
        body: JSON.stringify({
          opportunity_id: opportunityId,
          point_id: pointId || undefined,
          equipment_id: equipmentId || undefined,
          current_value: currentValue ?? undefined,
          target_value: targetValue ?? undefined,
          confidence: confidence ?? undefined,
          decision,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.code || 'APPLY blocked');
      return body;
    },
    onSuccess: (body) => {
      setCommandId(body.command?.command_id || body.command?.id || null);
      setMessage(body.reason || 'APPLIED');
      q.refetch();
    },
    onError: (err: Error) => setMessage(err.message),
  });
  const verify = useMutation({
    mutationFn: async () => {
      if (!commandId) throw new Error('Apply a command first');
      const res = await hvacFetch(`/api/platform/commands/${commandId}/verify`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.code || 'VERIFY blocked');
      return body;
    },
    onSuccess: (body) => setMessage(body.status || 'VERIFIED'),
    onError: (err: Error) => setMessage(err.message),
  });
  const rollback = useMutation({
    mutationFn: async () => {
      if (!commandId) throw new Error('Apply a command first');
      const res = await hvacFetch(`/api/platform/commands/${commandId}/rollback`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.code || 'ROLLBACK blocked');
      return body;
    },
    onSuccess: (body) => setMessage(body.status || 'ROLLED_BACK'),
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <section className="kpi-tile space-y-3" aria-label="Dispatch safety">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Dispatch readiness</div>
      <ul className="space-y-1 text-[12px] font-mono">
        {CHECKS.map((c) => {
          const ok = Boolean(checks[c.key]);
          return (
            <li key={c.key} className={ok ? 'text-emerald-700' : 'text-slate-500'}>
              {ok ? 'PASS' : 'FAIL'} {ok ? c.okLabel : c.failLabel}
            </li>
          );
        })}
        <li className={live.safeMode ? 'text-rose-700' : 'text-emerald-700'}>
          {live.safeMode ? 'FAIL SAFE MODE ON' : 'PASS SAFE MODE OFF'}
        </li>
        <li className="text-slate-500">SAFETY {String(data.safety || (live.safeMode ? 'HOLD' : 'PASS'))}</li>
        <li className="text-emerald-700">PASS DECISION {decision}</li>
        <li className={confidence != null && confidence >= 0.65 ? 'text-emerald-700' : 'text-slate-500'}>
          {confidence != null && confidence >= 0.65 ? 'PASS' : 'FAIL'} CONFIDENCE {confidence == null ? '—' : confidence.toFixed(2)}
        </li>
        <li className={currentValue != null ? 'text-emerald-700' : 'text-slate-500'}>
          {currentValue != null ? 'PASS' : 'FAIL'} CURRENT {currentValue == null ? '—' : currentValue}
        </li>
        <li className={targetValue != null ? 'text-emerald-700' : 'text-slate-500'}>
          {targetValue != null ? 'PASS' : 'FAIL'} TARGET {targetValue == null ? '—' : targetValue}
        </li>
        <li className={writesOn && !dataset ? 'text-emerald-700' : 'text-rose-700'}>
          {writesOn && !dataset ? 'PASS WRITE ENABLED' : 'FAIL WRITE DISABLED'}
        </li>
      </ul>
      <div
        className={
          canWrite
            ? 'border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg'
            : 'border border-rose-200 bg-rose-50 px-3 py-2 rounded-lg'
        }
        role="status"
      >
        <div className={`text-[11px] font-semibold ${canWrite ? 'text-emerald-800' : 'text-rose-800'}`}>
          {canWrite ? 'CONTROL ARMED' : 'CONTROL BLOCKED'}
        </div>
        <div className="text-[11px] font-mono text-slate-800 mt-1">{special || 'WRITE_DISABLED'}</div>
        <p className="text-[11px] text-slate-600 mt-1">{reason}</p>
        {oid === 'O18' && <p className="text-[11px] text-slate-500 mt-1">ADVISORY ONLY</p>}
        {oid === 'O19' && <p className="text-[11px] text-slate-500 mt-1">MAINTENANCE RECORD ONLY</p>}
        {oid === 'O20' && <p className="text-[11px] text-slate-500 mt-1">REVIEW REQUIRED</p>}
        {message && <p className="text-[11px] font-mono text-amber-800 mt-1">{message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={() => q.refetch()} title="Refresh dispatch evaluation">
          OPTIMIZE
        </button>
        <button
          type="button"
          className={`btn-primary text-xs ${canWrite ? '' : 'opacity-40'}`}
          disabled={!canWrite || apply.isPending}
          title={canWrite ? 'APPLY through evaluate_dispatch()' : 'Writes blocked'}
          onClick={() => apply.mutate()}
        >
          APPLY
        </button>
        <button
          type="button"
          className={`btn-secondary text-xs ${canWrite && commandId ? '' : 'opacity-40'}`}
          disabled={!canWrite || !commandId || verify.isPending}
          title="VERIFY through evaluate_dispatch()"
          onClick={() => verify.mutate()}
        >
          VERIFY
        </button>
        <button
          type="button"
          className={`btn-danger text-xs ${canWrite && commandId ? '' : 'opacity-40'}`}
          disabled={!canWrite || !commandId || rollback.isPending}
          title="ROLLBACK through evaluate_dispatch()"
          onClick={() => rollback.mutate()}
        >
          ROLLBACK
        </button>
      </div>
    </section>
  );
}
