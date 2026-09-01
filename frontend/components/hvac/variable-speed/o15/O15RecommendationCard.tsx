'use client';

import { useState } from 'react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import { confidencePct, dispatchBlockReason, fmtDash, fmtUnit, mapDecision, operatorErrorMessage } from '@/lib/hvac/o15Format';
import { ApiError } from '@/lib/api/client';
import { useO15Mutations } from '@/hooks/useO15';

export function O15RecommendationCard({ data, onError }: { data: O15Dashboard; onError: (m: string) => void }) {
  const mut = useO15Mutations();
  const [confirm, setConfirm] = useState(false);
  const [held, setHeld] = useState(false);
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const checks = data.safety?.checks || data.safety_checks || [];
  const current = cs.head_pressure_setpoint ?? cs.head_pressure;
  const recommended = os.recommended_head_pressure;
  const change =
    current != null && recommended != null && Number.isFinite(Number(current)) && Number.isFinite(Number(recommended))
      ? Number(recommended) - Number(current)
      : null;
  const conf = confidencePct(data.confidence);
  const decision = mapDecision(data);
  const block = held ? 'HOLD — OPERATOR HOLD' : dispatchBlockReason(data);
  const cmd = data.commands?.[0] || data.command;
  const writeBlocked = Boolean(block) || Boolean(data.safe_mode || data.header?.safe_mode);
  const why = data.why || {};
  const approval = (data.header?.control_mode || data.config?.control_mode || '').toUpperCase() === 'APPROVAL_REQUIRED';

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
      onError(operatorErrorMessage(e instanceof ApiError ? e : e, 'Dispatch blocked'));
      setConfirm(false);
    }
  };

  return (
    <section className="kpi-tile space-y-4 min-h-[280px]" aria-labelledby="o15-rec-title">
      <div className="flex items-start justify-between gap-2">
        <h2 id="o15-rec-title" className="text-sm font-semibold text-slate-900">
          O15 Optimization Recommendation
        </h2>
        <StatusBadge tone={toneForStatus(decision)}>{decision}</StatusBadge>
      </div>
      {!data.recommendation && !data.reason ? (
        <EmptyState title="No optimization recommendation available" detail="The engine has not produced a recommendation from current telemetry." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Current target</div>
              <div className="text-lg text-slate-900 mt-1">{fmtDash(current)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Recommended target</div>
              <div className="text-lg text-cyan-800 mt-1">{fmtDash(recommended)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Change</div>
              <div className="text-lg text-slate-900 mt-1">{change == null ? '—' : `${change > 0 ? '+' : ''}${fmtDash(change)}`}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Confidence</div>
              <div className="text-lg text-slate-900 mt-1">{conf}</div>
            </div>
          </div>
          <div className="text-xs text-slate-600">
            Expected impact:{' '}
            {data.energy_impact_class === 'PREDICTED' && data.predicted_power_delta_kw != null
              ? `${fmtUnit(data.predicted_power_delta_kw, 'kW')} (PREDICTED)`
              : '— kW'}
            <span className="text-slate-600"> · kWh/day —</span>
          </div>
          <div>
            <div className="text-[11px] uppercase text-slate-500 mb-2">Why this recommendation</div>
            <p className="text-xs text-slate-700 leading-relaxed">{data.reason || '—'}</p>
            <ul className="mt-2 space-y-1 text-xs font-mono">
              {checks.map((c) => (
                <li key={c.check_name} className={c.result === 'PASS' ? 'text-emerald-700' : 'text-amber-800'}>
                  {c.result === 'PASS' ? 'PASS' : 'FAIL'} {c.check_name}
                  {c.result !== 'PASS' && c.reason ? ` — ${c.reason}` : ''}
                </li>
              ))}
            </ul>
            {why.reason_for_change && <p className="text-[11px] text-slate-500 mt-2">{why.reason_for_change}</p>}
          </div>
          {block && (
            <div className="text-xs font-semibold text-amber-800" role="status">
              Apply Optimization DISABLED — {block}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary opacity-40"
              disabled
              title="WRITE_DISABLED — read-only commissioning mode."
              aria-label="Apply optimization"
            >
              Apply Optimization
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded border border-slate-200 text-xs focus-visible:ring-2 focus-visible:ring-cyan-400"
              aria-label="Hold recommendation"
              onClick={() => setHeld(true)}
            >
              Hold
            </button>
            <button
              type="button"
              className="btn-danger focus-visible:ring-2 focus-visible:ring-cyan-400"
              onClick={() =>
                mut.safeMode.mutate('O15 operator', {
                  onError: (e) => onError(e instanceof ApiError ? e.message : 'Safe mode failed'),
                })
              }
            >
              Safe Mode
            </button>
            {approval && (
              <>
                <button type="button" className="px-3 py-1.5 rounded border border-slate-200 text-xs" disabled title="O15 has no approve API">
                  Approve
                </button>
                <button type="button" className="px-3 py-1.5 rounded border border-slate-200 text-xs" disabled title="O15 has no reject API">
                  Reject
                </button>
              </>
            )}
          </div>
        </>
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="o15-apply-title">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 id="o15-apply-title" className="text-sm font-semibold text-slate-900">Confirm O15 dispatch</h3>
            <p className="text-xs font-mono text-slate-700">
              {fmtDash(cmd?.old_value)} → {fmtDash(cmd?.new_value)} · {cmd?.point_id || '—'}
            </p>
            {block && <p className="text-xs text-amber-800">{block}</p>}
            <div className="flex gap-2">
              <button type="button" className="px-3 py-1.5 border border-slate-200 text-xs" onClick={() => setConfirm(false)}>
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
