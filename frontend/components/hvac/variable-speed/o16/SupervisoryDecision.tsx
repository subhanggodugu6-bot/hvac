'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { O16Dashboard } from '@/lib/hvac/o16Types';
import { bmsBadge, confidencePct, fmtDash, freshnessBadge, mapO16Decision, recPayload, telemetryBadge } from '@/lib/hvac/o16Format';

function Stage({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  return (
    <div className="flex flex-col items-center text-[10px] font-mono">
      <span className={`px-2 py-1 border ${ok ? 'border-emerald-500/40 text-emerald-700' : warn ? 'border-amber-500/40 text-amber-800' : 'border-slate-200 text-slate-500'}`}>
        {label}
      </span>
    </div>
  );
}

export function SupervisoryDecision({ data }: { data: O16Dashboard }) {
  const cs = data.current_state || {};
  const os = data.optimized_state || {};
  const rec = recPayload(data);
  const decision = mapO16Decision(data);
  const tel = telemetryBadge(data);
  const fresh = freshnessBadge(data);
  const bms = bmsBadge(data);
  const mode = (data.header?.control_mode || data.config?.control_mode || 'ADVISORY').toUpperCase();
  const safety = (data.safety_status || data.header?.safety || 'HOLD').toUpperCase();
  const hasTel = tel === 'LIVE' || tel === 'SIMULATED' || tel === 'STALE' || tel === 'GOOD';
  return (
    <section className="kpi-tile space-y-3 col-span-12 lg:col-span-5" aria-labelledby="o16-dec">
      <h2 id="o16-dec" className="text-sm font-semibold text-slate-900">
        Supervisory Decision
      </h2>
      <StatusBadge tone={toneForStatus(decision)}>{decision}</StatusBadge>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-700">
        <div>Current {fmtDash(cs.head_pressure)}</div>
        <div>Target {fmtDash(os.recommended_head_pressure ?? rec.target_condensing_pressure)}</div>
        <div>Confidence {confidencePct(data.confidence ?? rec.confidence)}</div>
        <div>Telemetry {fresh}</div>
        <div>Safety {safety}</div>
        <div>BMS {bms}</div>
        <div>Mode {mode}</div>
        <div>Stream {tel}</div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1 pt-2" aria-label="Decision pipeline">
        <Stage label="TELEMETRY" ok={hasTel && tel === 'LIVE'} warn={tel !== 'LIVE'} />
        <span className="text-slate-600">↓</span>
        <Stage label="STATE" ok={Boolean(data.current_state)} />
        <span className="text-slate-600">↓</span>
        <Stage label="OPTIMIZATION" ok={decision === 'OPTIMIZE'} warn={decision !== 'OPTIMIZE'} />
        <span className="text-slate-600">↓</span>
        <Stage label="SAFETY" ok={safety === 'PASS'} warn={safety !== 'PASS'} />
        <span className="text-slate-600">↓</span>
        <Stage label="DECISION" ok={Boolean(decision)} />
      </div>
    </section>
  );
}
