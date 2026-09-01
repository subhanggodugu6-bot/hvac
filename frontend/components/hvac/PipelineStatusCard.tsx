'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Play } from 'lucide-react';
import { apiJson } from '@/lib/api/client';
import { StatusBadge } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import { Nb2PipelineStrip, type PipelineStage } from '@/components/hvac/Nb2PipelineStrip';

type PipelineStatus = {
  pipeline: string;
  stages?: PipelineStage[];
  use_ai_pipeline?: string;
  auto_dispatch?: boolean;
  worker?: {
    worker_running?: boolean;
    interval_seconds?: number;
    cycle_count?: number;
    last_cycle_time?: string | null;
    last_summary?: string;
    last_result?: { wrote_setpoints?: boolean; zones?: Array<{ code?: string }> };
  } | null;
  ai_watchdogs?: Record<
    string,
    { ok?: boolean; status?: string; ageSeconds?: number | null; note?: string }
  >;
  wrote_setpoints?: boolean;
};

function watchdogTone(status?: string, ok?: boolean): 'live' | 'warn' | 'danger' | 'muted' {
  if (ok) return 'live';
  if (status === 'STALE') return 'warn';
  if (status === 'NEVER') return 'muted';
  return 'danger';
}

export function PipelineStatusCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const pipeline = useQuery({
    queryKey: ['nb2-pipeline-status'],
    queryFn: () => apiJson('/platform/ai/pipeline/status') as Promise<PipelineStatus>,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  async function runPipeline() {
    setBusy(true);
    try {
      await apiJson('/platform/ai/pipeline/run?zone_id=ZONE-01', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['nb2-pipeline-status'] });
      await queryClient.invalidateQueries({ queryKey: ['safe-rl-status'] });
      await queryClient.invalidateQueries({ queryKey: ['rls-status'] });
      await queryClient.invalidateQueries({ queryKey: ['lstm-forecast'] });
    } finally {
      setBusy(false);
    }
  }

  const data = pipeline.data;
  const worker = data?.worker;
  const watchdogs = data?.ai_watchdogs || {};

  if (compact) {
    return <Nb2PipelineStrip compact />;
  }

  return (
    <div className="space-y-3">
      <Nb2PipelineStrip showRun />
      <section className="glass-card p-4 space-y-3 border border-violet-200/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800">
            <Activity className="w-3.5 h-3.5" />
            NB2 pipeline
          </div>
          <p className="text-[12px] text-slate-500 mt-1">
            {data?.pipeline || 'RLS → LSTM → Safe RL → Rule Engine → BMS Control'} — run a full cycle or open ML Registry for detail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <StatusBadge tone={worker?.worker_running ? 'live' : 'muted'} pulse={worker?.worker_running}>
            {worker?.worker_running ? 'WORKER ON' : 'WORKER OFF'}
          </StatusBadge>
          <StatusBadge tone={data?.auto_dispatch ? 'warn' : 'muted'} pulse={false}>
            {data?.auto_dispatch ? 'AUTO DISPATCH' : 'ADVISORY ONLY'}
          </StatusBadge>
          <button
            type="button"
            onClick={() => runPipeline()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {busy ? 'Running…' : 'Run cycle'}
          </button>
        </div>
      </div>

      {pipeline.isLoading ? (
        <div className="text-[12px] text-slate-500">Loading pipeline status…</div>
      ) : pipeline.isError ? (
        <EmptyState title="Pipeline unavailable" detail="Could not reach /api/platform/ai/pipeline/status." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500">Cycles</div>
              <div className="text-slate-900 font-semibold">{worker?.cycle_count ?? 0}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500">Interval</div>
              <div className="text-slate-900 font-semibold">{worker?.interval_seconds ?? '—'}s</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500">Last cycle</div>
              <div className="text-slate-900 font-semibold truncate">
                {worker?.last_cycle_time ? String(worker.last_cycle_time).slice(11, 19) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="text-slate-500">Wrote setpoints</div>
              <div className="text-slate-900 font-semibold">
                {String(worker?.last_result?.wrote_setpoints ?? false)}
              </div>
            </div>
          </div>
          {worker?.last_summary ? (
            <p className="text-[11px] text-slate-600 font-mono">{worker.last_summary}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(watchdogs).map(([name, slot]) => (
              <StatusBadge
                key={name}
                tone={watchdogTone(slot.status, slot.ok)}
                pulse={slot.ok && name === 'ai_pipeline'}
              >
                {name} {slot.status || '—'}
              </StatusBadge>
            ))}
          </div>
        </>
      )}
      </section>
    </div>
  );
}
