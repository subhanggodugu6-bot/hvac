'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O16Dashboard } from '@/lib/hvac/o16Types';
import { fmtDash, fmtUnit } from '@/lib/hvac/o16Format';

export function SafetyEnvelope({ data }: { data: O16Dashboard }) {
  const cfg = data.config || {};
  const checks = data.safety?.checks || data.safety_checks || [];
  const overall = (data.safety?.overall || data.overall_safety || data.safety_status || '').toUpperCase();
  const hold = overall.includes('HOLD') || overall.includes('REJECT') || overall.includes('BLOCK');
  const compressor = checks.find((c) => /compress|envelope/i.test(c.check_name));
  return (
    <section className="kpi-tile space-y-3 col-span-12" aria-labelledby="o16-safe">
      <div className="flex items-center justify-between gap-2">
        <h2 id="o16-safe" className="text-sm font-semibold text-slate-900">
          Safety & Control Envelope
        </h2>
        <StatusBadge tone={toneForStatus(hold ? 'SAFE HOLD' : data.safety_status)}>
          {hold ? 'SAFE HOLD' : fmtDash(data.safety_status)}
        </StatusBadge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-xs font-mono">
        <div className="border border-slate-200 p-2">
          <div className="text-slate-500">Minimum head pressure</div>
          <div className="text-slate-900 mt-1">{fmtDash(cfg.min_head_pressure)}</div>
        </div>
        <div className="border border-slate-200 p-2">
          <div className="text-slate-500">Maximum head pressure</div>
          <div className="text-slate-900 mt-1">{fmtDash(cfg.max_head_pressure)}</div>
        </div>
        <div className="border border-slate-200 p-2">
          <div className="text-slate-500">Maximum rate of change</div>
          <div className="text-slate-900 mt-1">{fmtUnit(cfg.max_pump_step_pct, '% / step')}</div>
        </div>
        <div className="border border-slate-200 p-2">
          <div className="text-slate-500">Minimum condenser water flow</div>
          <div className="text-slate-900 mt-1">{fmtDash(cfg.min_cw_flow)}</div>
        </div>
        <div className="border border-slate-200 p-2">
          <div className="text-slate-500">Maximum condenser water temperature</div>
          <div className="text-slate-900 mt-1">{fmtUnit(cfg.max_condensing_temp_c, '°C')}</div>
        </div>
        <div className="border border-slate-200 p-2">
          <div className="text-slate-500">Compressor envelope</div>
          <div className="text-slate-900 mt-1">{compressor ? compressor.result : '—'}</div>
        </div>
      </div>
      {hold && (
        <div className="text-xs text-amber-300">
          {data.reason || data.safety?.overall || 'Optimization held. See backend safety gates.'}
        </div>
      )}
      {checks.length ? (
        <ul className="space-y-1 text-xs font-mono">
          {checks.map((c) => (
            <li key={c.check_name} className="flex justify-between gap-3 border-b border-slate-200 py-1">
              <span className="text-slate-400">{c.check_name}</span>
              <span className={c.result === 'PASS' ? 'text-emerald-700' : 'text-amber-300'}>
                {c.result === 'PASS' ? 'PASS' : 'BLOCKED'}
                {c.result !== 'PASS' && c.reason ? ` · ${c.reason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No safety evaluation" detail="Gates appear after telemetry is evaluated." />
      )}
    </section>
  );
}
