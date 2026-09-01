'use client';

import { useState } from 'react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { formatDash, formatPercent } from '@/lib/hvac/formatters';
import { o10Provenance, o10RecommendationLabel, o10Temp, o10Enth, o10Str } from '@/lib/hvac/o10Format';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

export function O10Recommendation({ data }: { data: VentilationOpportunity }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const prov = o10Provenance(data);
  const rec = o10RecommendationLabel(data, prov);
  return (
    <section className="col-span-12 xl:col-span-8 kpi-tile space-y-3" aria-label="Supervisory recommendation">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Supervisory recommendation</div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={toneForStatus(rec)}>{rec}</StatusBadge>
        <StatusBadge tone={toneForStatus(data.status)}>{formatDash(data.status)}</StatusBadge>
      </div>
      <p className="text-sm text-slate-700">{formatDash(data.recommendation?.rationale)}</p>
      <button
        type="button"
        className="text-[11px] font-mono text-cyan-800 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-cyan-400"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Why this recommendation?
      </button>
      {open ? (
        <div className="border border-slate-200 p-3 space-y-1 text-[12px] font-mono text-slate-700">
          <p>Outdoor temperature: {o10Temp(data, 'outdoor_drybulb_c')}</p>
          <p>Outdoor enthalpy: {o10Enth(data, 'outdoor_enthalpy_kj_kg')}</p>
          <p>Return enthalpy: {o10Enth(data, 'return_enthalpy_kj_kg')}</p>
          <p>Occupancy: {o10Str(data, 'schedule_state')}</p>
          <p>Eligibility: {o10Str(data, 'economizer_status')}</p>
          <p>OA damper current / rec: {formatPercent(data.current?.damperPct)} / {formatPercent(data.optimized?.damperPct)}</p>
        </div>
      ) : null}
      <button
        type="button"
        className="text-[11px] font-mono text-cyan-800 underline-offset-2 hover:underline"
        aria-expanded={why}
        onClick={() => setWhy((v) => !v)}
      >
        Engineering rationale
      </button>
      {why ? (
        <div className="border border-slate-200 p-3 space-y-2 text-[12px] text-slate-700">
          <p>
            <span className="text-slate-500">Why economy cycle? </span>
            Outdoor air can provide cooling when its total energy/enthalpy is favorable compared with return air.
          </p>
          <p>
            <span className="text-slate-500">Energy strategy. </span>
            Reduce mechanical cooling/compressor operation by using favorable outdoor air as the first stage of cooling.
          </p>
          <p>
            <span className="text-slate-500">Humidity consideration. </span>
            Do not rely on outdoor relative humidity alone. Use enthalpy, absolute humidity, or dew point as returned by the engine.
          </p>
          <p>
            <span className="text-slate-500">Mechanical cooling. </span>
            Economy cycle can operate as the first stage and together with mechanical cooling when required.
          </p>
          <p>
            <span className="text-slate-500">Backend reason. </span>
            {formatDash(data.recommendation?.rationale || data.supervisory?.reason)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
