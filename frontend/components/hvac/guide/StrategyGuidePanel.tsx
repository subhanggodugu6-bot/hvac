'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  EngineeringChart,
  EngineeringTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  CHART_COLORS,
} from '@/components/hvac/EngineeringChart';
import { GUIDE_CATS, guideCatForOpportunityId, type GuideCat } from '@/lib/hvac/guideTypes';
import { evaluateOehGuide, fetchOehCatalog, officialGuideId } from '@/lib/hvac/oehGuideApi';
import { mappingHref } from '@/lib/hvac/dashboardHome';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtSlider(v: number, unit: string, step: number) {
  const decimals = step < 1 ? 2 : 0;
  return `${Number(v).toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

function withGuideView(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, 'http://local.guide');
    url.searchParams.set('view', 'guide');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

export function StrategyGuidePanel({ opportunityId }: { opportunityId: string }) {
  const search = useSearchParams();
  const oid = officialGuideId(opportunityId, search.get('mode') || undefined);
  const fallbackCat = GUIDE_CATS[guideCatForOpportunityId(oid || opportunityId)] || GUIDE_CATS.scheduling;
  const [included, setIncluded] = useState(false);
  const [achieved, setAchieved] = useState(70);
  const [annualCost, setAnnualCost] = useState(250000);
  const [sliders, setSliders] = useState<Record<string, number>>({});
  const [checks, setChecks] = useState<Record<number, boolean>>({});

  const catalog = useQuery({
    queryKey: ['oeh-guide', oid],
    queryFn: () => fetchOehCatalog(oid!),
    enabled: Boolean(oid),
  });

  const sliderVals = useMemo(() => {
    const next: Record<string, number> = {};
    (catalog.data?.sliders || []).forEach((s) => {
      next[s.key] = sliders[s.key] ?? s.default;
    });
    return next;
  }, [catalog.data, sliders]);

  const sliderKey = JSON.stringify(sliderVals);
  const [debouncedKey, setDebouncedKey] = useState(sliderKey);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKey(sliderKey), 200);
    return () => window.clearTimeout(t);
  }, [sliderKey]);

  const evaluated = useQuery({
    queryKey: ['oeh-guide-eval', oid, debouncedKey],
    queryFn: () => evaluateOehGuide(oid!, JSON.parse(debouncedKey || '{}')),
    enabled: Boolean(oid && catalog.isSuccess),
  });

  if (!oid) {
    return (
      <div className="kpi-tile kpi-tile-flush" role="alert">
        <div className="text-sm text-slate-800">OEH guide needs an official catalog id (O1–O20)</div>
        <p className="text-[11px] text-slate-500 mt-1">Received {opportunityId || '(empty)'}. O6–O8 open from the temperature-reset page with mode=HHW, CHW, or CW.</p>
      </div>
    );
  }
  if (catalog.isLoading) {
    return <div className="kpi-tile kpi-tile-flush text-[11px] font-mono text-slate-500">Loading OEH guide {oid}…</div>;
  }
  if (catalog.isError || !catalog.data) {
    return (
      <div className="kpi-tile kpi-tile-flush" role="alert">
        <div className="text-sm text-slate-800">Unable to load OEH guide {oid}</div>
        <p className="text-[11px] text-slate-500 mt-1">Backend catalog required. Values are not fabricated as LIVE.</p>
        <button type="button" className="btn-secondary mt-2 text-[11px] font-mono" onClick={() => catalog.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const item = catalog.data;
  const cat = GUIDE_CATS[(item.cat as GuideCat)] || fallbackCat || GUIDE_CATS.scheduling;
  const prevHref = withGuideView(item.prev_route);
  const nextHref = withGuideView(item.next_route);
  const ev = evaluated.data;
  const pts = ev?.series || [];
  const metrics = ev?.metrics || [];
  const chartData = pts.map((p) => ({
    label: item.x_type === 'month' ? MONTHS[p.x] : `${String(p.x).padStart(2, '0')}:00`,
    baseline: Number(p.baseline.toFixed(2)),
    optimized: Number(p.optimized.toFixed(2)),
  }));
  const effectivePct = included ? (item.pct * achieved) / 100 : 0;
  const dollars = annualCost * (effectivePct / 100);
  const optWidth = included ? Math.max(100 - effectivePct, 4) : 100;
  const equip = item.equipment.split(',').map((s) => s.trim()).filter(Boolean);
  const circ = 2 * Math.PI * 32;
  const dash = (item.pct / 100) * circ;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 kpi-tile kpi-tile-flush">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: cat.color }}>
            OEH guide {item.opportunity_id} · {ev?.provenance || 'SIMULATED'} — not live BMS · agent read-only
          </div>
          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{item.summary}</p>
          {ev?.agent?.recommendation ? (
            <p className="text-[11px] font-mono text-slate-500 mt-2">
              Agent {item.opportunity_id} {ev.agent.recommendation}
              {ev.dispatch_allowed ? '' : ' · dispatch blocked'}
            </p>
          ) : null}
          {ev?.agent?.reason ? <p className="text-[11px] font-mono text-slate-600 mt-1">{ev.agent.reason}</p> : null}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setIncluded((v) => !v)}>
            <span className="text-[9px] font-mono uppercase text-slate-500">Include in savings estimate</span>
            <span className={`w-14 h-7 rounded-full border relative ${included ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${included ? 'left-8 bg-emerald-500' : 'left-0.5 bg-slate-400'}`} />
            </span>
            <span className={`text-[9px] font-mono ${included ? 'text-emerald-700' : 'text-slate-500'}`}>{included ? 'INCLUDED' : 'NOT INCLUDED'}</span>
          </button>
          <div className="relative w-[76px] h-[76px]">
            <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
              <circle cx="38" cy="38" r="32" stroke="rgba(26,26,29,0.1)" strokeWidth="6" fill="none" />
              <circle cx="38" cy="38" r="32" stroke={cat.color} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - dash} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
              <span className="text-sm font-bold">{item.pct}%</span>
              <span className="text-[8px] text-slate-500 uppercase">GUIDE_POTENTIAL</span>
            </div>
          </div>
        </div>
      </div>

      <div className="kpi-tile kpi-tile-flush">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Principle</div>
          <p className="text-sm text-slate-600 leading-relaxed">{item.principle}</p>
        </div>
        <div className="kpi-tile kpi-tile-flush">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Equipment — map in Gateway</div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {equip.map((eq) => (
              <li key={eq}>
                <Link href={mappingHref()} className="text-sm text-violet-700 hover:text-violet-900">
                  {eq}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="kpi-tile kpi-tile-flush">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Current practice</div>
          <p className="text-sm text-slate-600 leading-relaxed">{item.practice}</p>
        </div>
        <div className="kpi-tile kpi-tile-flush">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Potential (GUIDE_POTENTIAL)</div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Up to {item.pct}% of {item.scope} — individual, non-cumulative. Not measured LIVE kW.
          </p>
        </div>
        {item.scenario ? (
          <div className="kpi-tile kpi-tile-flush" style={{ background: cat.dim, borderColor: cat.color }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: cat.color }}>
              Case study · OEH example (not this building)
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{item.scenario}</p>
          </div>
        ) : null}
        {item.recommendation ? (
          <div className="kpi-tile kpi-tile-flush">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Recommended action</div>
            <p className="text-sm text-slate-600 leading-relaxed">{item.recommendation}</p>
          </div>
        ) : null}

      <div className="kpi-tile kpi-tile-flush">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Guide comparison (simulated) — {item.scope}</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-24 text-[11px] font-mono text-slate-500">Baseline</span>
            <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
              <div className="h-full bg-slate-400" style={{ width: '100%' }} />
            </div>
            <span className="w-10 text-right text-[11px] font-mono">100%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-24 text-[11px] font-mono text-slate-500">Optimized</span>
            <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
              <div className="h-full" style={{ width: `${optWidth}%`, background: cat.color }} />
            </div>
            <span className="w-10 text-right text-[11px] font-mono" style={{ color: cat.color }}>
              {optWidth.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      <div className="kpi-tile kpi-tile-flush">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-3">
          Simulation console — {ev?.sim_label || item.sim_label}
          {evaluated.isFetching ? ' · evaluating' : ''}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          {item.sliders.map((sl) => (
            <label key={sl.key} className="block">
              <span className="text-[11px] font-mono text-slate-600">{sl.label}</span>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range"
                  className="flex-1"
                  style={{ accentColor: cat.color }}
                  min={sl.min}
                  max={sl.max}
                  step={sl.step}
                  value={sliderVals[sl.key]}
                  onChange={(e) => setSliders((s) => ({ ...s, [sl.key]: Number(e.target.value) }))}
                />
                <span className="w-16 text-right text-[11px] font-mono" style={{ color: cat.color }}>
                  {fmtSlider(sliderVals[sl.key], sl.unit, sl.step)}
                </span>
              </div>
            </label>
          ))}
        </div>
        {evaluated.isError ? (
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] text-amber-700">Guide evaluate failed. Chart is not labeled LIVE.</p>
            <button type="button" className="btn-secondary text-[10px] font-mono py-1" onClick={() => evaluated.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        {chartData.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-[11px] font-mono text-slate-500">
            {evaluated.isFetching ? 'Evaluating simulated series…' : 'No simulated series yet'}
          </div>
        ) : (
          <EngineeringChart height={180}>
            <LineChart data={chartData}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke={CHART_COLORS.axis} tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis stroke={CHART_COLORS.axis} tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip content={<EngineeringTooltip />} />
              <Line type="monotone" dataKey="baseline" name="Baseline (guide)" stroke={CHART_COLORS.baseline} strokeDasharray="4 3" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="optimized" name="Optimized (guide)" stroke={cat.color} dot={false} strokeWidth={2.2} />
            </LineChart>
          </EngineeringChart>
        )}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 mt-2">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="text-lg font-mono font-bold" style={{ color: cat.color }}>
                {m.value}
              </div>
              <div className="text-[9px] font-mono uppercase text-slate-500 mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="kpi-tile kpi-tile-flush">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-3">Savings Calculator</div>
        <p className="text-[11px] text-slate-500 mb-3">Not verified M&amp;V. Not a BMS result. Assumed spend only.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[11px] font-mono text-slate-600">Assumed annual {item.scope} spend (USD)</span>
            <div className="mt-1 flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2">
              <span className="text-slate-600 font-mono">$</span>
              <input
                type="number"
                className="w-full bg-transparent py-2 text-sm font-mono outline-none"
                min={0}
                step={1000}
                value={annualCost}
                onChange={(e) => setAnnualCost(Number(e.target.value) || 0)}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] font-mono text-slate-600">Assumed achievement (% of OEH max {item.pct}%)</span>
            <div className="flex items-center gap-2 mt-2">
              <input type="range" className="flex-1" style={{ accentColor: cat.color }} min={0} max={100} value={achieved} onChange={(e) => setAchieved(Number(e.target.value))} />
              <span className="w-10 text-right text-[11px] font-mono" style={{ color: cat.color }}>
                {achieved}%
              </span>
            </div>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100">
          <div>
            <div className={`text-lg font-mono font-bold ${included ? '' : 'text-slate-600'}`} style={included ? { color: cat.color } : undefined}>
              {effectivePct.toFixed(1)}%
            </div>
            <div className="text-[9px] font-mono uppercase text-slate-500 mt-1">Effective saving</div>
          </div>
          <div>
            <div className={`text-lg font-mono font-bold ${included ? '' : 'text-slate-600'}`} style={included ? { color: cat.color } : undefined}>
              ${Math.round(dollars).toLocaleString()}
            </div>
            <div className="text-[9px] font-mono uppercase text-slate-500 mt-1">Estimated $ / year</div>
          </div>
          <div>
            <div className={`text-lg font-mono font-bold ${included ? '' : 'text-slate-600'}`} style={included ? { color: cat.color } : undefined}>
              ${Math.round(dollars * 5).toLocaleString()}
            </div>
            <div className="text-[9px] font-mono uppercase text-slate-500 mt-1">Projected / 5 years</div>
          </div>
        </div>
      </div>

      <div className="kpi-tile kpi-tile-flush">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">Commissioning checklist — minimum equipment</div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {equip.map((eq, i) => (
            <li key={eq}>
              <button type="button" className="flex items-start gap-2 text-left text-sm text-slate-700" onClick={() => setChecks((c) => ({ ...c, [i]: !c[i] }))}>
                <span className={`mt-0.5 w-4 h-4 rounded border shrink-0 ${checks[i] ? '' : 'border-slate-300'}`} style={checks[i] ? { background: cat.color, borderColor: cat.color } : undefined} />
                <span className={checks[i] ? 'text-slate-500 line-through' : 'text-slate-700'}>{eq}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        {prevHref ? (
          <Link href={prevHref} className="flex-1 btn-secondary justify-center text-[11px] font-mono py-2">
            ← {item.prev_id}
          </Link>
        ) : (
          <div className="flex-1" />
        )}
        {nextHref ? (
          <Link href={nextHref} className="flex-1 btn-secondary justify-center text-[11px] font-mono py-2">
            {item.next_id} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
