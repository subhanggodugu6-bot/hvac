'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { actionErrorText } from '@/lib/hvac/actionError';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o10ApplyBlock, o10CanApply, o10Provenance } from '@/lib/hvac/o10Format';
import { useO10Mutations, useO10Opportunity } from '@/hooks/useO10';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

export function O10SafetyActions({ data, platform }: { data: VentilationOpportunity; platform?: PlatformGate | null }) {
  const prov = o10Provenance(data);
  const allowed = o10CanApply(data, prov, platform);
  const block = o10ApplyBlock(data, prov, platform);
  const mut = useO10Mutations();
  const opp = useO10Opportunity();
  const err =
    (mut.dispatch.isError && actionErrorText(mut.dispatch.error)) ||
    (mut.verify.isError && actionErrorText(mut.verify.error)) ||
    (mut.rollback.isError && actionErrorText(mut.rollback.error)) ||
    null;

  return (
    <aside className="col-span-12 xl:col-span-4 space-y-3">
      <section className="kpi-tile space-y-2" aria-label="Dispatch safety">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Dispatch safety</h2>
        <dl className="space-y-1.5 text-[12px] font-mono">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">BMS</dt>
            <dd>
              <StatusBadge tone={toneForStatus(prov === 'LIVE' ? 'CONNECTED' : 'OFFLINE')}>
                {prov === 'LIVE' ? 'CONNECTED' : 'OFFLINE'}
              </StatusBadge>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Telemetry</dt>
            <dd>{formatDash(data.telemetry?.quality)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Freshness</dt>
            <dd>{prov}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Safety envelope</dt>
            <dd>
              <StatusBadge tone={toneForStatus(data.safety?.status)}>{formatDash(data.safety?.status)}</StatusBadge>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">SAFE MODE</dt>
            <dd>{platform?.safeMode ? 'ON' : 'OFF'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Decision</dt>
            <dd>{formatDash(data.supervisory?.decision)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Confidence</dt>
            <dd>{formatPercent(data.confidence)}</dd>
          </div>
        </dl>
        {!allowed ? (
          <div className="border border-rose-500/30 bg-rose-950/30 px-3 py-2" role="status">
            <div className="text-[11px] font-semibold text-rose-800">DISPATCH BLOCKED</div>
            <p className="text-[11px] font-mono text-rose-200 mt-1">{block}</p>
            <p className="text-[11px] text-slate-500 mt-1">No BMS command will be issued.</p>
          </div>
        ) : null}
      </section>
      <section className="kpi-tile space-y-2" aria-label="O10 actions">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-xs focus-visible:ring-2 focus-visible:ring-cyan-400"
            onClick={() => opp.refetch()}
          >
            OPTIMIZE
          </button>
          <button
            type="button"
            className="btn-primary text-xs opacity-40 disabled:opacity-40"
            disabled
            title="WRITE_DISABLED — read-only commissioning mode."
          >
            APPLY
          </button>
          <button
            type="button"
            className="btn-secondary text-xs opacity-40"
            disabled
            title="WRITE_DISABLED — read-only commissioning mode."
          >
            VERIFY
          </button>
          <button
            type="button"
            className="btn-danger text-xs opacity-40"
            disabled
            title="WRITE_DISABLED — read-only commissioning mode."
          >
            ROLLBACK
          </button>
        </div>
        {err ? (
          <p className="text-[11px] text-rose-800" role="alert">
            {err}
          </p>
        ) : null}
        <p className="text-[11px] text-slate-500">evaluate_dispatch is the write gate. Responses are not hardcoded SUCCESS.</p>
      </section>
    </aside>
  );
}
