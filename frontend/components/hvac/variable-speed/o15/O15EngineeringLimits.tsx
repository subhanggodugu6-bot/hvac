'use client';

import { useState } from 'react';
import type { O15Dashboard } from '@/lib/hvac/o15Types';
import { fmtDash } from '@/lib/hvac/o15Format';

export function O15EngineeringLimits({ data }: { data: O15Dashboard }) {
  const [open, setOpen] = useState(false);
  const cfg = data.config || {};
  const labels = data.config_labels || {};
  return (
    <section className="kpi-tile">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold text-slate-900">Engineering Limits</h2>
        <span className="text-[11px] font-mono text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
          <div>
            <dt className="text-slate-500">Minimum Head Pressure</dt>
            <dd className="text-slate-900">
              {fmtDash(cfg.min_head_pressure)} <span className="text-slate-600">{labels.min_head_pressure || 'CONFIGURABLE'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Maximum Head Pressure</dt>
            <dd className="text-slate-900">
              {fmtDash(cfg.max_head_pressure)} <span className="text-slate-600">{labels.max_head_pressure || 'CONFIGURABLE'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Maximum Rate of Change</dt>
            <dd className="text-slate-900">
              {fmtDash(cfg.max_fan_step_pct)} % / step <span className="text-slate-600">{labels.max_fan_step_pct || 'CONFIGURABLE'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Approach band</dt>
            <dd className="text-slate-900">
              {fmtDash(cfg.approach_min_c)} – {fmtDash(cfg.approach_max_c)} °C
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Minimum Confidence</dt>
            <dd className="text-slate-900">—</dd>
          </div>
          <div>
            <dt className="text-slate-500">Maximum Telemetry Age</dt>
            <dd className="text-slate-900">—</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
