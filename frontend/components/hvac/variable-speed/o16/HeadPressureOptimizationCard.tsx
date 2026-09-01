'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O16Dashboard } from '@/lib/hvac/o16Types';
import { confidencePct, fmtDash, isMissing, mapO16Decision, recPayload } from '@/lib/hvac/o16Format';

function markerPct(value: unknown, min: unknown, max: unknown): number | null {
  if (isMissing(value) || isMissing(min) || isMissing(max)) return null;
  const v = Number(value);
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(b) || b === a) return null;
  return Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100));
}

export function HeadPressureOptimizationCard({ data }: { data: O16Dashboard }) {
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const rec = recPayload(data);
  const current = cs.head_pressure;
  const recommended = os.recommended_head_pressure ?? rec.target_condensing_pressure;
  const delta =
    current != null && recommended != null && Number.isFinite(Number(current)) && Number.isFinite(Number(recommended))
      ? Number(recommended) - Number(current)
      : null;
  const min = data.config?.min_head_pressure;
  const max = data.config?.max_head_pressure;
  const curPct = markerPct(current, min, max);
  const recPct = markerPct(recommended, min, max);
  const decision = mapO16Decision(data);
  return (
    <section className="kpi-tile space-y-4 h-full" aria-labelledby="o16-opt-title">
      <div className="flex items-start justify-between gap-2">
        <h2 id="o16-opt-title" className="text-sm font-semibold text-slate-900">
          Head Pressure Optimization
        </h2>
        <StatusBadge tone={toneForStatus(decision)}>
          {decision === 'OPTIMIZE' ? 'OPTIMIZATION AVAILABLE' : decision}
        </StatusBadge>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <div className="text-[10px] uppercase text-slate-500">Current condensing pressure</div>
          <div className="text-lg text-slate-900 mt-1">{fmtDash(current)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Recommended</div>
          <div className="text-lg text-cyan-800 mt-1">{fmtDash(recommended)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Delta</div>
          <div className="text-lg text-slate-900 mt-1">{delta == null ? '—' : `${delta > 0 ? '+' : ''}${fmtDash(delta)}`}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500">Confidence</div>
          <div className="text-lg text-slate-900 mt-1">{confidencePct(data.confidence ?? rec.confidence)}</div>
        </div>
      </div>
      <div className="space-y-3" aria-label="Pressure range">
        <div>
          <div className="text-[10px] uppercase text-slate-500 mb-1">Current {fmtDash(current)}</div>
          <div className="relative h-2 bg-slate-200 border border-slate-200">
            {curPct != null && <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-cyan-400" style={{ left: `calc(${curPct}% - 5px)` }} />}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500 mb-1">Recommended {fmtDash(recommended)}</div>
          <div className="relative h-2 bg-slate-200 border border-slate-200">
            {recPct != null && <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ left: `calc(${recPct}% - 5px)` }} />}
          </div>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Safe range {fmtDash(min)} — {fmtDash(max)}
        </div>
      </div>
      <div className="text-xs text-slate-400 leading-relaxed">
        <div className="text-[11px] uppercase text-slate-500 mb-1">Optimization objective</div>
        Minimize total compressor + condenser water pumping energy while maintaining compressor operating envelope, condenser
        approach, condenser water temperature, minimum condensing pressure, and equipment safety limits.
      </div>
    </section>
  );
}
