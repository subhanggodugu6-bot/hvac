'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Play } from 'lucide-react';
import { apiJson } from '@/lib/api/client';
import { StatusBadge } from '@/components/hvac/StatusBadge';

export type PipelineStage = {
  id: string;
  label: string;
  title: string;
  status: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'bad' | 'muted';
  href?: string;
};

type PipelineStatusPayload = {
  pipeline?: string;
  stages?: PipelineStage[];
  worker?: { worker_running?: boolean; cycle_count?: number };
  auto_dispatch?: boolean;
};

const TONE_STYLES: Record<string, string> = {
  good: 'border-emerald-200 bg-emerald-50/70',
  warn: 'border-amber-200 bg-amber-50/70',
  bad: 'border-pink-200 bg-pink-50/70',
  muted: 'border-slate-200 bg-slate-50/80',
};

const TONE_BADGE: Record<string, 'live' | 'warn' | 'danger' | 'muted' | 'neutral'> = {
  good: 'live',
  warn: 'warn',
  bad: 'danger',
  muted: 'muted',
};

const FALLBACK_STAGES: PipelineStage[] = [
  { id: 'rls', label: 'RLS', title: 'Online Learning', status: '—', tone: 'muted', href: '/ml' },
  { id: 'lstm', label: 'LSTM', title: 'Forecast', status: '—', tone: 'muted', href: '/ml' },
  { id: 'safe_rl', label: 'Safe RL', title: 'Optimizer', status: '—', tone: 'muted', href: '/ml' },
  { id: 'rules', label: 'Rule Engine', title: 'Safety Gate', status: '—', tone: 'muted', href: '/ml' },
  { id: 'bms', label: 'BMS Control', title: 'Stage G Writes', status: '—', tone: 'muted', href: '/platform/bms' },
];

function StageCard({ stage }: { stage: PipelineStage }) {
  const shell = TONE_STYLES[stage.tone || 'muted'] || TONE_STYLES.muted;
  const body = (
    <div className={`rounded-xl border px-3 py-2.5 min-w-[9.5rem] flex-1 ${shell} transition-colors hover:shadow-sm`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700">{stage.label}</div>
      <div className="text-[9px] text-slate-500 mt-0.5">{stage.title}</div>
      <div className="mt-2">
        <StatusBadge tone={TONE_BADGE[stage.tone || 'muted'] || 'neutral'} pulse={false}>
          {stage.status}
        </StatusBadge>
      </div>
      {stage.detail ? (
        <p className="text-[9px] text-slate-600 mt-1.5 leading-snug line-clamp-2">{stage.detail}</p>
      ) : null}
    </div>
  );

  if (stage.href) {
    return (
      <Link href={stage.href} className="block min-w-0 flex-1">
        {body}
      </Link>
    );
  }
  return <div className="min-w-0 flex-1">{body}</div>;
}

export function Nb2PipelineStrip({ compact, showRun }: { compact?: boolean; showRun?: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const pipeline = useQuery({
    queryKey: ['nb2-pipeline-status'],
    queryFn: () => apiJson('/platform/ai/pipeline/status') as Promise<PipelineStatusPayload>,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const stages = pipeline.data?.stages?.length ? pipeline.data.stages : FALLBACK_STAGES;
  const worker = pipeline.data?.worker;

  async function runPipeline() {
    setBusy(true);
    try {
      await apiJson('/platform/ai/pipeline/run?zone_id=ZONE-01', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['nb2-pipeline-status'] });
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {stages.map((s) => (
          <StatusBadge key={s.id} tone={TONE_BADGE[s.tone || 'muted'] || 'neutral'} pulse={false}>
            {s.label} {s.status}
          </StatusBadge>
        ))}
      </div>
    );
  }

  return (
    <section className="card-static p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-slate-800">NB2 AI pipeline</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {pipeline.data?.pipeline || 'RLS → LSTM → Safe RL → Rule Engine → BMS Control'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <StatusBadge tone={worker?.worker_running ? 'live' : 'muted'} pulse={worker?.worker_running}>
            {worker?.worker_running ? 'WORKER ON' : 'WORKER OFF'}
          </StatusBadge>
          {pipeline.data?.auto_dispatch ? (
            <StatusBadge tone="warn" pulse={false}>
              AUTO DISPATCH
            </StatusBadge>
          ) : null}
          <span className="text-[10px] font-mono text-slate-500 self-center">cycle {worker?.cycle_count ?? 0}</span>
          {showRun ? (
            <button
              type="button"
              onClick={() => void runPipeline()}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              {busy ? 'Running…' : 'Run cycle'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto eng-scroll pb-1">
        {stages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            <StageCard stage={stage} />
            {i < stages.length - 1 ? (
              <div className="flex items-center shrink-0 px-0.5 text-slate-300" aria-hidden>
                <ChevronRight className="w-4 h-4" />
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>

      {pipeline.isLoading ? <p className="text-[10px] text-slate-400 animate-pulse">Refreshing stage status…</p> : null}
    </section>
  );
}
