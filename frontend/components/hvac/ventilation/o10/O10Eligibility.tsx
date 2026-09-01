'use client';

import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import type { PlatformGate } from '@/lib/hvac/o20Api';
import { O10_GUIDE, o10Eligibility, o10EngineLimit, o10Provenance } from '@/lib/hvac/o10Format';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

export function O10Eligibility({ data, platform }: { data: VentilationOpportunity; platform?: PlatformGate | null }) {
  const rows = o10Eligibility(data, o10Provenance(data), platform);
  const limits = [
    o10EngineLimit(data, 'outdoor_temp_limit', O10_GUIDE.outdoorTempC),
    o10EngineLimit(data, 'dew_point_limit_c', O10_GUIDE.dewPointC),
    o10EngineLimit(data, 'enthalpy_limit_kjkg', O10_GUIDE.outdoorEnthalpyKjkg),
    o10EngineLimit(data, 'return_enthalpy_margin_kjkg', O10_GUIDE.enthalpyMarginKjkg),
  ];
  return (
    <section className="col-span-12 kpi-tile space-y-3" aria-label="Economy cycle eligibility">
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500">Economy cycle eligibility</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        {rows.map((r) => (
          <div key={r.id} className="border border-slate-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{r.label}</div>
            <div className="mt-1">
              <StatusBadge tone={toneForStatus(r.value)}>{r.value}</StatusBadge>
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Document / configuration reference</div>
        <dl className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-[12px] font-mono">
          {limits.map((l, i) => (
            <div key={i} className="border border-slate-200 px-3 py-2">
              <dt className="text-slate-500">Guide {l.guide}</dt>
              <dd className="text-slate-800 mt-1">Configured {l.configured}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-slate-500 mt-2">Guide bands are from the HVAC guide. Configured values appear only when the backend returns them.</p>
      </div>
    </section>
  );
}
