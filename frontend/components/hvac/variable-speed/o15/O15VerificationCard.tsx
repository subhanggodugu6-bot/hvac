'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O15Command } from '@/lib/hvac/o15Types';
import { fmtDash } from '@/lib/hvac/o15Format';
import { useO15Mutations } from '@/hooks/useO15';

export function O15VerificationCard({ command }: { command?: O15Command }) {
  const mut = useO15Mutations();
  const status = (command?.status || '').toUpperCase();
  let verify = '—';
  if (command?.verified_at || status === 'VERIFIED') verify = 'VERIFIED';
  else if (status === 'ROLLBACK_REQUIRED' || status === 'VERIFICATION_FAILED' || status === 'ROLLED_BACK') verify = 'ROLLBACK REQUIRED';
  else if (status === 'APPLIED' || status === 'VERIFYING') verify = 'PENDING';
  const id = command?.command_id;
  return (
    <section className="kpi-tile space-y-2" aria-labelledby="o15-verify">
      <h2 id="o15-verify" className="text-sm font-semibold text-slate-900">
        Verification
      </h2>
      <div className="text-xs font-mono text-slate-700 space-y-1">
        <div>Command {fmtDash(command?.status)}</div>
        <div>Target {fmtDash(command?.new_value)}</div>
        <div>Actual —</div>
      </div>
      <StatusBadge tone={toneForStatus(verify)}>{verify}</StatusBadge>
      {verify === 'ROLLBACK REQUIRED' && (
        <div className="text-[11px] font-mono text-slate-600">
          Previous {fmtDash(command?.old_value)} · Applied {fmtDash(command?.new_value)} · Rollback {fmtDash(command?.old_value)}
        </div>
      )}
      {id && (status === 'APPLIED' || status === 'VERIFYING') && (
        <button
          type="button"
          className="px-3 py-1.5 border border-slate-200 text-xs opacity-40"
          disabled
          title="WRITE_DISABLED — read-only commissioning mode."
        >
          Verify
        </button>
      )}
    </section>
  );
}

export function O15RollbackStatus({ command }: { command?: O15Command }) {
  const mut = useO15Mutations();
  const status = (command?.status || '').toUpperCase();
  let rb = 'NOT REQUIRED';
  if (status === 'ROLLBACK_REQUIRED' || status === 'VERIFICATION_FAILED') rb = 'READY';
  else if (status === 'ROLLED_BACK' || command?.rollback_at) rb = 'EXECUTED';
  else if (status === 'FAILED' && command?.rollback_at) rb = 'FAILED';
  const id = command?.command_id;
  const showControl = Boolean(id && (rb === 'READY' || status === 'APPLIED' || status === 'FAILED'));
  return (
    <section className="kpi-tile space-y-2" aria-labelledby="o15-rb">
      <h2 id="o15-rb" className="text-sm font-semibold text-slate-900">
        Rollback
      </h2>
      <div className="text-xs font-mono text-slate-700">{rb}</div>
      {command?.rollback_at && (
        <div className="text-[11px] font-mono text-slate-600">
          Reason {fmtDash(command.reason)} · Timestamp {fmtDash(command.rollback_at)} · Previous {fmtDash(command.old_value)} · Restored {fmtDash(command.old_value)}
        </div>
      )}
      {showControl && id && (
        <button
          type="button"
          className="btn-danger text-xs opacity-40"
          disabled
          title="WRITE_DISABLED — read-only commissioning mode."
        >
          Execute rollback
        </button>
      )}
    </section>
  );
}
