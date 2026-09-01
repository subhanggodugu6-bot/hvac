'use client';

import React from 'react';

export type StatusTone = 'live' | 'neutral' | 'warn' | 'danger' | 'muted';

const TONES: Record<StatusTone, string> = {
  live: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  neutral: 'bg-violet-50 border-violet-200 text-violet-700',
  warn: 'bg-amber-50 border-amber-200 text-amber-800',
  danger: 'bg-pink-50 border-pink-200 text-pink-700',
  muted: 'bg-slate-50 border-slate-200 text-slate-500',
};

export function toneForStatus(value?: string | null): StatusTone {
  if (!value) return 'muted';
  const v = value.toUpperCase();
  if (/(SIMULATION|SIMULATED|DEMO|SAFE_HOLD|WAIT_FOR|ROLLBACK|HOLD)/.test(v)) return 'warn';
  if (/(BLOCK|BAD|REJECT|OFFLINE|FAILED|FAULT|ERROR|DISCONNECTED)/.test(v)) return 'danger';
  if (/(STALE|DEGRADED|WARNING|WARN|AWAITING|NO LIVE|NO DATA|PENDING)/.test(v)) return 'warn';
  if (/(LIVE|GOOD|HEALTHY|OPTIMAL|ACTIVE|RUNNING|READY|APPLIED|VERIFIED|CONNECTED|PASS|MONITORING|OPTIMIZE|ENABLED)/.test(v)) return 'live';
  return 'neutral';
}

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: StatusTone;
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ children, tone = 'live', pulse = false }) => {
  const showPulse = pulse === true;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wide shadow-sm ${TONES[tone]}`}>
      {showPulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-50 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
};
