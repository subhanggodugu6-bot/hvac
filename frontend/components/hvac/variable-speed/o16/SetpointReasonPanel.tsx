'use client';

import { useState } from 'react';
import type { O16Dashboard } from '@/lib/hvac/o16Types';
import { confidencePct, fmtDash, fmtUnit, recPayload } from '@/lib/hvac/o16Format';

export function SetpointReasonPanel({ data }: { data: O16Dashboard }) {
  const [open, setOpen] = useState(true);
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const rec = recPayload(data);
  const target = os.recommended_head_pressure ?? rec.target_condensing_pressure;
  const cfg = data.config || {};
  const margin = cs.head_pressure_margin;
  return (
    <section className="kpi-tile col-span-12 lg:col-span-5">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="text-sm font-semibold text-slate-900">Why {fmtDash(target)}?</h2>
        <span className="text-[11px] font-mono text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <dl className="mt-3 space-y-1.5 text-xs font-mono text-slate-700">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Condenser water temperature</dt>
            <dd>{fmtUnit(cs.cewt_c, '°C')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Outdoor wet-bulb</dt>
            <dd>{fmtUnit(cs.outdoor_wet_bulb_c, '°C')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Cooling tower approach</dt>
            <dd>{fmtUnit(cs.approach_c, '°C')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Current compressor load</dt>
            <dd>{fmtUnit(cs.load_pct, '%')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Minimum allowable condensing pressure</dt>
            <dd>{fmtDash(cfg.min_head_pressure)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Maximum allowable condensing pressure</dt>
            <dd>{fmtDash(cfg.max_head_pressure)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Safety margin</dt>
            <dd>{fmtDash(margin)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Optimization objective</dt>
            <dd className="text-slate-400 mt-1 leading-relaxed">
              {data.why?.control_relationship ||
                'Minimum combined compressor + condenser-water-system energy, subject to configured envelopes.'}
            </dd>
          </div>
          <div className="pt-2 text-slate-400">Decision confidence {confidencePct(data.confidence ?? rec.confidence)}</div>
        </dl>
      )}
    </section>
  );
}
