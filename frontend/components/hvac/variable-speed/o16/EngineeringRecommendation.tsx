'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { ApiError } from '@/lib/api/client';
import { useO16Mutations } from '@/hooks/useO16';
import type { O16Dashboard } from '@/lib/hvac/o16Types';
import {
  confidencePct,
  dispatchBlockReason,
  fmtDash,
  fmtUnit,
  mapO16Decision,
  o16Error,
  recPayload,
} from '@/lib/hvac/o16Format';

export function EngineeringRecommendation({ data, onError }: { data: O16Dashboard; onError: (m: string) => void }) {
  const mut = useO16Mutations();
  const [confirm, setConfirm] = useState(false);
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const rec = recPayload(data);
  const current = cs.head_pressure_setpoint ?? cs.head_pressure;
  const recommended = os.recommended_head_pressure ?? rec.target_condensing_pressure;
  const decision = mapO16Decision(data);
  const block = dispatchBlockReason(data);
  const checks = data.safety?.checks || data.safety_checks || [];
  const cmd = data.commands?.[0] || data.command;
  const approval = (data.header?.control_mode || data.config?.control_mode || '').toUpperCase() === 'APPROVAL_REQUIRED';
  const energy =
    data.energy_impact_class === 'PREDICTED' && data.predicted_power_delta_kw != null ? data.predicted_power_delta_kw : null;

  const apply = async () => {
    try {
      let id = cmd?.command_id;
      if (!id) {
        const next = await mut.optimize.mutateAsync();
        id = next.command?.command_id || next.commands?.[0]?.command_id;
      }
      if (!id) {
        onError('No command available to apply');
        setConfirm(false);
        return;
      }
      await mut.apply.mutateAsync({ id, confirm: true });
      setConfirm(false);
    } catch (e) {
      onError(o16Error(e instanceof ApiError ? e : e));
      setConfirm(false);
    }
  };

  return (
    <section className="kpi-tile space-y-3 col-span-12 lg:col-span-7" aria-labelledby="o16-eng-rec">
      <div className="flex items-start justify-between gap-2">
        <h2 id="o16-eng-rec" className="text-sm font-semibold text-white">
          Engineering Recommendation
        </h2>
        <StatusBadge tone={toneForStatus(decision)}>{decision}</StatusBadge>
      </div>
      {!data.reason && !rec.reason && !os.recommended_head_pressure ? (
        <EmptyState title="No optimization recommendation available" detail="The engine has not produced a write recommendation from current telemetry." />
      ) : (
        <>
          <p className="text-xs text-slate-300 leading-relaxed">{data.reason || rec.reason || '—'}</p>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              Current target
              <div className="text-lg text-slate-100">{fmtDash(current)}</div>
            </div>
            <div>
              Recommended target
              <div className="text-lg text-cyan-300">{fmtDash(recommended)}</div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Expected impact: compressor / pump energy {energy == null ? '—' : `${fmtUnit(energy, 'kW')} (PREDICTED)`}
          </div>
          <div>
            <div className="text-[11px] uppercase text-slate-500 mb-1">Conditions</div>
            <ul className="space-y-1 text-xs font-mono">
              {checks.map((c) => (
                <li key={c.check_name} className={c.result === 'PASS' ? 'text-emerald-400' : 'text-amber-300'}>
                  {c.result === 'PASS' ? 'PASS' : 'FAIL'} {c.check_name}
                  {c.result !== 'PASS' && c.reason ? ` — ${c.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
          {block && (
            <div className="text-xs font-semibold text-amber-300" role="status">
              Dispatch disabled — {block}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Recommendations are not applied automatically.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary opacity-40"
              disabled
              title="WRITE_DISABLED — read-only commissioning mode."
            >
              Apply optimization
            </button>
            {approval && (
              <button
                type="button"
                className="px-3 py-1.5 border border-white/10 text-xs focus-visible:ring-2 focus-visible:ring-cyan-400"
                disabled={!cmd?.command_id}
                onClick={() => cmd?.command_id && mut.approve.mutate(cmd.command_id)}
              >
                Approve
              </button>
            )}
            <button type="button" className="btn-danger text-xs" onClick={() => mut.safeMode.mutate('O16 operator')}>
              Safe Mode
            </button>
          </div>
        </>
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md w-full bg-[#0c1220] border border-white/[0.12] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Confirm O16 dispatch</h3>
            <p className="text-xs font-mono text-slate-300">
              {fmtDash(cmd?.old_value)} → {fmtDash(cmd?.new_value)} · {cmd?.point_id || '—'}
            </p>
            <div className="flex gap-2">
              <button type="button" className="px-3 py-1.5 border border-white/10 text-xs" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary opacity-40" disabled title="WRITE_DISABLED — read-only commissioning mode.">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
