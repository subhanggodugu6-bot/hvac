'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { o10CycleStatus, o10Provenance, o10VisualMode } from '@/lib/hvac/o10Format';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

export function O10StatusStrip({ data, platform }: { data: VentilationOpportunity; platform?: PlatformGate | null }) {
  const prov = o10Provenance(data);
  const cycle = o10CycleStatus(data, prov);
  return (
    <section className="col-span-12 kpi-tile space-y-2" aria-label="Economy cycle status">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Economy cycle status</div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={toneForStatus(cycle.status)}>{cycle.status}</StatusBadge>
        <StatusBadge tone={toneForStatus(o10VisualMode(data))}>{o10VisualMode(data)}</StatusBadge>
        {platform?.safeMode ? <StatusBadge tone="danger">SAFE MODE</StatusBadge> : null}
        {prov === 'SIMULATED' ? <StatusBadge tone="warn">SIMULATED — never LIVE</StatusBadge> : null}
      </div>
      <p className="text-sm text-slate-700">{cycle.reason}</p>
    </section>
  );
}
