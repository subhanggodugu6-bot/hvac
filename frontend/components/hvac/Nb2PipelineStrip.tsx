'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Play } from 'lucide-react';
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
  data_ok?: boolean;
  missing?: string[];
  metrics?: Record<string, unknown>;
};

type PipelineHealth = {
  ready_stages?: number;
  total_stages?: number;
  all_ok?: boolean;
  gap_count?: number;
  missing_items?: string[];
};

type PipelineStatusPayload = {
  pipeline?: string;
  stages?: PipelineStage[];
  health?: PipelineHealth;
  worker?: {
    worker_running?: boolean;
    cycle_count?: number;
    interval_seconds?: number;
    last_cycle_time?: string | null;
    last_summary?: string;
    last_result?: { wrote_setpoints?: boolean };
  };
  auto_dispatch?: boolean;
  ai_watchdogs?: Record<string, { ok?: boolean; status?: string }>;
};

const TONE_STYLES: Record<string, string> = {
  good: 'border-emerald-200 bg-emerald-50/70 ring-emerald-100',
  warn: 'border-amber-200 bg-amber-50/70 ring-amber-100',
  bad: 'border-pink-200 bg-pink-50/70 ring-pink-100',
  muted: 'border-slate-200 bg-slate-50/80 ring-slate-100',
};

const TONE_BADGE: Record<string, 'live' | 'warn' | 'danger' | 'muted' | 'neutral'> = {
  good: 'live',
  warn: 'warn',
  bad: 'danger',
  muted: 'muted',
};

const STAGE_NUM: Record<string, number> = {
  rls: 1,
  lstm: 2,
  safe_rl: 3,
  rules: 4,
  bms: 5,
};

const FALLBACK_STAGES: PipelineStage[] = [
  { id: 'rls', label: 'RLS', title: 'Online Learning', status: '—', tone: 'muted', href: '/ml#stage-rls' },
  { id: 'lstm', label: 'LSTM', title: 'Forecast', status: '—', tone: 'muted', href: '/ml#stage-lstm' },
  { id: 'safe_rl', label: 'Safe RL', title: 'Optimizer', status: '—', tone: 'muted', href: '/ml#stage-safe-rl' },
  { id: 'rules', label: 'Rule Engine', title: 'Safety Gate', status: '—', tone: 'muted', href: '/ml#stage-rules' },
  { id: 'bms', label: 'BMS Control', title: 'Stage G Writes', status: '—', tone: 'muted', href: '/ml#stage-bms' },
];

function watchdogTone(status?: string, ok?: boolean): 'live' | 'warn' | 'danger' | 'muted' {
  if (ok) return 'live';
  if (status === 'STALE') return 'warn';
  if (status === 'NEVER') return 'muted';
  return 'danger';
}

function StageCard({ stage, index }: { stage: PipelineStage; index: number }) {
  const shell = TONE_STYLES[stage.tone || 'muted'] || TONE_STYLES.muted;
  const hasGaps = stage.data_ok === false || (stage.missing?.length ?? 0) > 0;
  const step = STAGE_NUM[stage.id] ?? index + 1;

  const body = (
    <div
      className={`rounded-xl border px-3 py-2.5 min-w-[10rem] flex-1 ring-1 ${shell} transition-all hover:shadow-md hover:-translate-y-0.5`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/80 text-[10px] font-bold text-slate-600 border border-slate-200">
          {step}
        </span>
        {stage.data_ok === true ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Data OK" />
        ) : hasGaps ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Data gap" />
        ) : null}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 mt-1">{stage.label}</div>
      <div className="text-[9px] text-slate-500 mt-0.5">{stage.title}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        <StatusBadge tone={TONE_BADGE[stage.tone || 'muted'] || 'neutral'} pulse={false}>
          {stage.status}
        </StatusBadge>
        {hasGaps ? (
          <StatusBadge tone="warn" pulse={false}>
            DATA GAP
          </StatusBadge>
        ) : stage.data_ok ? (
          <StatusBadge tone="live" pulse={false}>
            DATA OK
          </StatusBadge>
        ) : null}
      </div>
      {stage.detail ? (
        <p className="text-[9px] text-slate-600 mt-1.5 leading-snug line-clamp-2">{stage.detail}</p>
      ) : null}
      {stage.missing?.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {stage.missing.slice(0, 2).map((m) => (
            <li key={m} className="text-[8px] text-amber-800 leading-tight line-clamp-2">
              · {m}
            </li>
          ))}
          {(stage.missing.length ?? 0) > 2 ? (
            <li className="text-[8px] text-amber-700">+{stage.missing.length - 2} more</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );

  if (stage.href) {
    return (
      <Link href={stage.href} className="block min-w-0 flex-1 scroll-mt-24">
        {body}
      </Link>
    );
  }
  return <div className="min-w-0 flex-1">{body}</div>;
}

function HealthBanner({ health, loading }: { health?: PipelineHealth; loading?: boolean }) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500 animate-pulse">
        Checking pipeline data health…
      </div>
    );
  }
  if (!health) return null;

  const ready = health.ready_stages ?? 0;
  const total = health.total_stages ?? 5;
  const gaps = health.gap_count ?? 0;
  const allOk = health.all_ok;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        allOk ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {allOk ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          )}
          <span className="text-[12px] font-semibold text-slate-800">
            {allOk ? 'All pipeline stages have required data' : `${gaps} data gap${gaps === 1 ? '' : 's'} detected`}
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-600">
          {ready}/{total} stages OK
        </span>
      </div>
      {!allOk && (health.missing_items?.length ?? 0) > 0 ? (
        <ul className="mt-2 space-y-0.5 max-h-24 overflow-y-auto eng-scroll">
          {(health.missing_items || []).map((item) => (
            <li key={item} className="text-[10px] text-amber-900 leading-snug">
              · {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WorkerDetails({
  worker,
  watchdogs,
  expanded,
  onToggle,
}: {
  worker?: PipelineStatusPayload['worker'];
  watchdogs?: PipelineStatusPayload['ai_watchdogs'];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-t border-slate-200/80 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-800"
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Worker & watchdog details
      </button>
      {expanded ? (
        <div className="mt-2 space-y-2">
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
            {Object.entries(watchdogs || {}).map(([name, slot]) => (
              <StatusBadge
                key={name}
                tone={watchdogTone(slot.status, slot.ok)}
                pulse={slot.ok && name === 'ai_pipeline'}
              >
                {name} {slot.status || '—'}
              </StatusBadge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Nb2PipelineStrip({
  compact,
  showRun,
  variant = 'strip',
}: {
  compact?: boolean;
  showRun?: boolean;
  variant?: 'strip' | 'full';
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [workerExpanded, setWorkerExpanded] = useState(false);

  const pipeline = useQuery({
    queryKey: ['nb2-pipeline-status'],
    queryFn: () => apiJson('/platform/ai/pipeline/status') as Promise<PipelineStatusPayload>,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const stages = pipeline.data?.stages?.length ? pipeline.data.stages : FALLBACK_STAGES;
  const worker = pipeline.data?.worker;
  const health = pipeline.data?.health;
  const watchdogs = pipeline.data?.ai_watchdogs;

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

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {stages.map((s) => (
          <StatusBadge key={s.id} tone={TONE_BADGE[s.tone || 'muted'] || 'neutral'} pulse={false}>
            {s.label} {s.status}
            {s.data_ok === false ? ' ⚠' : ''}
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
          ) : (
            <StatusBadge tone="muted" pulse={false}>
              ADVISORY ONLY
            </StatusBadge>
          )}
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

      <HealthBanner health={health} loading={pipeline.isLoading} />

      <div className="flex items-stretch gap-1 overflow-x-auto eng-scroll pb-1">
        {stages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            <StageCard stage={stage} index={i} />
            {i < stages.length - 1 ? (
              <div className="flex items-center shrink-0 px-0.5 text-slate-300" aria-hidden>
                <ChevronRight className="w-4 h-4" />
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>

      {variant === 'full' ? (
        <WorkerDetails
          worker={worker}
          watchdogs={watchdogs}
          expanded={workerExpanded}
          onToggle={() => setWorkerExpanded((v) => !v)}
        />
      ) : null}

      {pipeline.isError ? (
        <p className="text-[10px] text-pink-700">Could not reach pipeline status API.</p>
      ) : pipeline.isLoading ? (
        <p className="text-[10px] text-slate-400 animate-pulse">Refreshing stage status…</p>
      ) : null}
    </section>
  );
}
