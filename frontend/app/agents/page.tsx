'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import { hvacFetch } from '@/lib/api/client';
import { PLATFORM_POLL_MS } from '@/lib/hvac/poll';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';
import { AlertRail, SystemsHub } from '@/components/hvac/bms-home';
import { mergeDashboardChapters, type DashboardHome } from '@/lib/hvac/dashboardHome';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';

const RAIL: Record<string, string> = {
  scheduling: 'var(--cat-scheduling)',
  'plant-control': 'var(--cat-plant)',
  ventilation: 'var(--cat-ventilation)',
  'variable-speed': 'var(--cat-variablespeed)',
  operations: 'var(--cat-om)',
};

function telDot(label?: string) {
  const v = String(label || '').toUpperCase();
  if (v === 'LIVE') return 'bg-emerald-500';
  if (v === 'SIMULATED' || v === 'STALE') return 'bg-amber-500';
  if (v.includes('BAD') || v.includes('OFF')) return 'bg-pink-500';
  return 'bg-slate-400';
}

function controlLabel(raw?: string | null) {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'SIM WRITE ENABLED' || v === 'SIM_WRITE_ENABLED') return 'SIM WRITE ENABLED';
  if (v === 'LIVE WRITE ENABLED' || v === 'LIVE_WRITE_ENABLED') return 'LIVE WRITE ENABLED';
  if (v.includes('ENABLED') && !v.includes('DISABLED')) return 'WRITE ENABLED';
  if (v === 'ADVISORY' || v === 'MAINTENANCE' || v === 'REVIEW') return v;
  return 'WRITE DISABLED';
}

function controlArmed(label: string) {
  return label.includes('ENABLED') && !label.includes('DISABLED');
}

export default function AgentsPage() {
  const live = useLiveTelemetry();
  const home = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: async () => (await hvacFetch('/api/platform/dashboard/home')).json(),
    refetchInterval: PLATFORM_POLL_MS,
  });
  const { data } = useQuery({
    queryKey: ['agent-center'],
    queryFn: async () => (await hvacFetch('/api/agents')).json(),
    refetchInterval: PLATFORM_POLL_MS,
  });
  const groups = data?.groups || [];
  const dash = home.data as DashboardHome | undefined;
  const chapters = mergeDashboardChapters(dash?.chapters);
  const pageControl = (() => {
    for (const g of groups as { controlAvailability?: string; cards?: { control?: string }[] }[]) {
      const ga = controlLabel(g.controlAvailability);
      if (controlArmed(ga)) return ga;
      for (const c of g.cards || []) {
        const cl = controlLabel(c.control);
        if (controlArmed(cl)) return cl;
      }
    }
    return 'WRITE DISABLED';
  })();

  const counts = chapters.reduce(
    (acc, ch) => {
      acc.live += ch.counts.live;
      acc.sim += ch.counts.simulated;
      acc.await += ch.counts.awaiting;
      return acc;
    },
    { live: 0, sim: 0, await: 0 },
  );

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={Users}
        title="Systems Intelligence"
        subtitle="OEH / AIRAH chapters §2–§6. ENGINE is the decision method; MODEL is the ML registry label. O9 / O17–O20 show REVIEW / ADVISORY / MAINTENANCE, not writes."
        badge="O1–O20"
      />
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={toneForStatus(live.bmsStatus)} pulse={false}>
          BMS {live.bmsStatus}
        </StatusBadge>
        <StatusBadge tone={toneForStatus(live.telemetryStatus)} pulse={live.telemetryStatus === 'LIVE'}>
          TELEMETRY {live.telemetryStatus}
        </StatusBadge>
        <StatusBadge tone={controlArmed(pageControl) ? 'live' : 'muted'} pulse={false}>
          {pageControl}
        </StatusBadge>
        <StatusBadge tone="neutral" pulse={false}>
          {counts.live} LIVE · {counts.sim} SIM · {counts.await} AWAITING
        </StatusBadge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-9 space-y-4">
          <SystemsHub chapters={chapters} variant="full" />
        </div>
        <div className="xl:col-span-3">
          <AlertRail alerts={dash?.alerts} />
        </div>
      </div>

      <details className="card-static p-4">
        <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">Compact opportunity list</summary>
        <div className="space-y-6 mt-4">
          {groups.map(
            (g: {
              id: string;
              title: string;
              href: string;
              status: string;
              controlAvailability?: string;
              recommendation?: string;
              cards?: {
                id: string;
                status: string;
                telemetry: string;
                recommendation: string;
                control: string;
                engine?: string;
                model?: string;
                kind?: string;
              }[];
            }) => {
              const groupControl = controlLabel(g.controlAvailability);
              return (
                <section key={g.id} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={g.href}
                      className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 hover:text-violet-700"
                    >
                      <span className="w-1.5 h-5 rounded-full" style={{ background: RAIL[g.id] || 'var(--accent-purple)' }} />
                      {g.title}
                    </Link>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <StatusBadge tone={toneForStatus(g.status)} pulse={false}>
                        {g.status}
                      </StatusBadge>
                      <StatusBadge tone="muted" pulse={false}>
                        REC {g.recommendation || 'UNAVAILABLE'}
                      </StatusBadge>
                      <StatusBadge tone={controlArmed(groupControl) ? 'live' : 'muted'} pulse={false}>
                        {groupControl}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {(g.cards || []).map((card) => {
                      const def = getOpportunity(card.id);
                      const href = def?.route || g.href;
                      const waiting = String(card.status || '').includes('WAITING');
                      const ctrl = controlLabel(card.control);
                      return (
                        <Link
                          key={card.id}
                          href={href}
                          className="card-interactive glass-card flex flex-col justify-between p-3.5 group"
                          style={{ borderLeft: `3px solid ${RAIL[g.id] || 'var(--accent-purple)'}` }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700">
                              {card.id}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-600 shrink-0" />
                          </div>
                          <h3 className="text-[14px] font-semibold text-slate-900 mt-2 tracking-tight leading-snug group-hover:text-violet-700">
                            {def?.shortLabel || def?.title || ''}
                          </h3>
                          <div className="mt-2 space-y-1 text-[11px] font-mono text-slate-500">
                            <div className="flex justify-between gap-2 items-center">
                              <span>TEL</span>
                              <span className="text-slate-700 inline-flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${telDot(card.telemetry)}`} />
                                {card.telemetry}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>REC</span>
                              <span className="text-slate-700 text-right">{card.recommendation}</span>
                            </div>
                            <div className={`flex justify-between gap-2 ${ctrl === 'WRITE DISABLED' ? 'text-pink-600' : 'text-emerald-600'}`}>
                              <span>CTRL</span>
                              <span>{ctrl}</span>
                            </div>
                          </div>
                          {waiting ? <div className="text-[10px] text-amber-700 mt-2">Waiting for mapped telemetry</div> : null}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            },
          )}
        </div>
      </details>
      {groups.length === 0 && <EmptyState title="NO DATA" detail="Agent groups did not load from the backend." />}
    </div>
  );
}
