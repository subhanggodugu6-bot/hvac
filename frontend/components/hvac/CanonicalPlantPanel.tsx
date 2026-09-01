'use client';

import { useQuery } from '@tanstack/react-query';
import { hvacFetch } from '@/lib/api/client';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import { displayValue } from '@/lib/hvac/liveTelemetryStore';

function prettyName(name: string) {
  return name.replace(/_/g, ' ');
}

function qualityClass(q?: string) {
  const v = String(q || '').toUpperCase();
  if (v === 'GOOD') return 'text-emerald-800';
  if (v === 'STALE') return 'text-amber-700';
  if (v === 'BAD') return 'text-rose-800';
  return 'text-slate-500';
}

export function CanonicalPlantPanel({ opportunityId }: { opportunityId: string }) {
  const enabled = /^O\d+$/i.test(opportunityId);
  const ctx = useQuery({
    queryKey: ['agent-context', opportunityId],
    queryFn: async () => (await hvacFetch(`/api/agents/${opportunityId}/context`)).json(),
    refetchInterval: 10000,
    enabled,
  });
  const rec = useQuery({
    queryKey: ['agent-recommendation', opportunityId],
    queryFn: async () => (await hvacFetch(`/api/agents/${opportunityId}/recommendation`)).json(),
    refetchInterval: 10000,
    enabled,
  });
  const c = ctx.data || {};
  const r = rec.data || {};
  const features = (c.features || {}) as Record<
    string,
    { value?: unknown; unit?: string; quality?: string; source?: string; age_seconds?: number }
  >;
  const missing = (c.missing_features || []) as string[];
  const entries = Object.entries(features);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section className="glass-card p-5 space-y-4" aria-label="Live plant inputs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Live plant inputs</div>
            <div className="text-[11px] font-mono text-slate-500 mt-1">
              {c.telemetry?.source || '—'} · {c.telemetry?.quality || '—'} ·{' '}
              {c.telemetry?.age_seconds == null ? '—' : `${Math.round(c.telemetry.age_seconds)}s`}
            </div>
          </div>
          <StatusBadge tone={toneForStatus(c.status)}>{c.status || 'WAITING FOR TELEMETRY'}</StatusBadge>
        </div>
        {entries.length === 0 ? (
          <EmptyState
            title="NO DATA"
            detail="Required canonical points are not mapped yet. Map discovered BMS points, then this studio will fill."
            href="/platform/bms"
            actionLabel="Open BMS mapping"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {entries.map(([name, f]) => {
              const empty = f.value == null || String(f.quality || '').toUpperCase() === 'BAD';
              return (
                <div key={name} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{prettyName(name)}</div>
                  <div className="mt-1 text-[15px] font-semibold tabular-nums text-slate-900">
                    {empty ? '—' : displayValue(f.value)}
                    {!empty && f.unit ? <span className="text-[11px] font-normal text-slate-500 ml-1">{f.unit}</span> : null}
                  </div>
                  <div className="mt-1 flex justify-between gap-2 text-[10px] font-mono">
                    <span className={qualityClass(f.quality)}>{f.quality || 'MISSING'}</span>
                    <span className="text-slate-600">{f.age_seconds == null ? '—' : `${Math.round(f.age_seconds)}s`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {missing.length > 0 && (
          <div className="text-[11px] text-amber-800/90">Waiting for: {missing.map(prettyName).join(', ')}</div>
        )}
      </section>

      <section className="glass-card p-5 space-y-4" aria-label="Engineering recommendation">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Engineering recommendation</div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={r.recommendation_status === 'AVAILABLE' ? 'live' : 'warn'} pulse={false}>
              {r.recommendation_status || 'UNAVAILABLE'}
            </StatusBadge>
            <StatusBadge tone="muted" pulse={false}>
              WRITE DISABLED
            </StatusBadge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Current</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {r.current?.value == null ? '—' : r.current.value}
              {r.current?.unit ? <span className="text-[12px] font-normal text-slate-500 ml-1">{r.current.unit}</span> : null}
            </div>
            <div className="text-[10px] font-mono text-slate-600 mt-1">{r.current?.point || '—'}</div>
          </div>
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-800">Recommended</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-cyan-900">
              {r.recommended?.value == null ? '—' : r.recommended.value}
              {r.recommended?.unit ? <span className="text-[12px] font-normal text-cyan-700 ml-1">{r.recommended.unit}</span> : null}
            </div>
            <div className="text-[10px] font-mono text-cyan-800 mt-1">{r.recommended?.point || '—'}</div>
          </div>
        </div>
        <p className="text-[12px] text-slate-600 leading-relaxed">{r.rationale || 'No recommendation until required plant points are present.'}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500">
          <span>Confidence {r.confidence == null ? '—' : r.confidence}</span>
          <span>Energy {r.energy_impact == null ? 'NO DATA' : r.energy_impact}</span>
          {r.ml ? <span>MODEL PREDICTION {r.ml.status}</span> : null}
        </div>
        <div className="text-[11px] text-rose-800">{r.dispatch?.reason || 'WRITE_DISABLED'}</div>
      </section>
    </div>
  );
}
