'use client';

import { EmptyState } from '@/components/hvac/EmptyState';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import { fmtDash } from '@/lib/hvac/o15Format';

export function O15SafetyPanel({ data }: { data: O15Dashboard }) {
  const checks = data.safety?.checks || data.safety_checks || [];
  return (
    <section className="kpi-tile" aria-labelledby="o15-safety">
      <h2 id="o15-safety" className="text-sm font-semibold text-slate-900 mb-3">
        Safety & Control Envelope
      </h2>
      <p className="text-[10px] text-slate-500 mb-2">Backend SafetyEngine is authoritative</p>
      {checks.length ? (
        <ul className="space-y-1.5">
          {checks.map((c) => {
            const pass = c.result === 'PASS';
            return (
              <li key={c.check_name} className="flex justify-between gap-3 text-xs font-mono border-b border-slate-200 py-1">
                <span className="text-slate-400">{c.check_name}</span>
                <span className={pass ? 'text-emerald-700' : 'text-amber-300'}>
                  ● {pass ? 'PASS' : 'BLOCKED'}
                  {!pass && c.reason ? ` · ${c.reason}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No safety evaluation" detail="Gates appear after telemetry is evaluated." />
      )}
      <div className="mt-3 text-sm font-semibold text-slate-900">{fmtDash(data.safety?.overall || data.overall_safety)}</div>
    </section>
  );
}
