'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import { useDashboardHomeQuery } from '@/lib/hvac/platformQueries';
import {
  AgentsChapterGrid,
  AlertRail,
  ModuleKpiCard,
  moduleControlLabel,
  type AgentModuleCardData,
} from '@/components/hvac/bms-home';
import { Nb2PipelineStrip } from '@/components/hvac/Nb2PipelineStrip';
import { mergeDashboardChapters, type DashboardHome } from '@/lib/hvac/dashboardHome';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { useLiveTelemetry } from '@/lib/hvac/liveTelemetryStore';

const RAIL: Record<string, string> = {
  scheduling: 'var(--cat-scheduling)',
  'plant-control': 'var(--cat-plant)',
  ventilation: 'var(--cat-ventilation)',
  'variable-speed': 'var(--cat-variablespeed)',
  operations: 'var(--cat-om)',
};

function controlArmed(label: string) {
  return label.includes('ENABLED') && !label.includes('DISABLED');
}

export default function AgentsPage() {
  const live = useLiveTelemetry();
  const home = useDashboardHomeQuery();

  const groups = home.data?.groups || [];
  const dash = home.data as DashboardHome | undefined;
  const chapters = mergeDashboardChapters(dash?.chapters);

  const pageControl = (() => {
    for (const g of groups as { controlAvailability?: string; cards?: { control?: string }[] }[]) {
      const ga = moduleControlLabel(g.controlAvailability);
      if (controlArmed(ga)) return ga;
      for (const c of g.cards || []) {
        const cl = moduleControlLabel(c.control);
        if (controlArmed(cl)) return cl;
      }
    }
    return 'WRITE DISABLED';
  })();

  const counts = useMemo(
    () =>
      chapters.reduce(
        (acc, ch) => {
          acc.live += ch.counts.live;
          acc.sim += ch.counts.simulated;
          acc.await += ch.counts.awaiting;
          return acc;
        },
        { live: 0, sim: 0, await: 0 },
      ),
    [chapters],
  );

  return (
    <div className="page-shell">
      <PageHeader
        icon={Users}
        title="Systems Intelligence"
        subtitle="Pipeline status, per-module telemetry, and write posture. Building plant canvas and the full O1–O20 register live on Overview."
        badge="O1–O20"
        actions={
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
        }
      />

      <Nb2PipelineStrip showRun />

      <section className="card-static p-5 space-y-4">
        <div className="section-heading">
          <h2>Chapters</h2>
          <Link href="/overview" className="text-[11px] font-semibold text-violet-700 hover:text-violet-900">
            Full register on Overview →
          </Link>
        </div>
        <AgentsChapterGrid chapters={chapters} />
      </section>

      <AlertRail alerts={dash?.alerts} compact />

      <section className="card-static p-5 space-y-5">
        <div className="section-heading">
          <h2>Module cards</h2>
          <span className="text-[11px] font-mono text-slate-500">{groups.length} chapters · 20 modules</span>
        </div>
        <div className="space-y-8">
          {groups.map(
            (g) => {
              const groupControl = moduleControlLabel(g.controlAvailability);
              const rail = RAIL[g.id] || 'var(--accent-purple)';
              const cards = (g.cards || []) as AgentModuleCardData[];
              return (
                <section key={g.id} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <Link
                      href={g.href}
                      className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-slate-800 hover:text-violet-700"
                    >
                      <span className="w-1.5 h-6 rounded-full" style={{ background: rail }} />
                      {g.title}
                    </Link>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <StatusBadge tone={toneForStatus(g.status)} pulse={false}>
                        {g.status || 'NO DATA'}
                      </StatusBadge>
                      <StatusBadge tone="muted" pulse={false}>
                        REC {g.recommendation || 'UNAVAILABLE'}
                      </StatusBadge>
                      <StatusBadge tone={controlArmed(groupControl) ? 'live' : 'muted'} pulse={false}>
                        {groupControl}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {cards.map((card) => {
                      const def = getOpportunity(card.id);
                      const href = def?.route || g.href;
                      return <ModuleKpiCard key={card.id} card={card} href={href} railColor={rail} />;
                    })}
                  </div>
                </section>
              );
            },
          )}
        </div>
      </section>

      {groups.length === 0 && <EmptyState title="NO DATA" detail="Agent groups did not load from the backend." />}
    </div>
  );
}
