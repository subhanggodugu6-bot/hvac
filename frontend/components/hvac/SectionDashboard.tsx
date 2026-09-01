'use client';

import React from 'react';
import { OpportunityCard, OpportunityCardField } from './OpportunityCard';
import { KPIGrid } from './KPIGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChapterChrome } from '@/components/hvac/bms-home';
import { OpportunityDef } from '@/lib/hvac/opportunityConfig';
import { LucideIcon } from 'lucide-react';

export interface SectionDashboardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  badge?: string;
  kpis?: {
    label: string;
    value?: React.ReactNode | null;
    detail?: React.ReactNode | null;
    unit?: string | null;
    status?: string | null;
    source?: string | null;
    quality?: string | null;
    icon?: LucideIcon;
  }[];
  kpiEmptyText?: string;
  chapterId?: string;
  cards: {
    def: OpportunityDef;
    status?: string | null;
    fields?: OpportunityCardField[];
    impactLabel?: string;
    impactValue?: React.ReactNode | null;
    emptyTitle?: string;
    emptyDetail?: string;
    telemetryLabel?: string | null;
    href?: string;
    maxFields?: number;
  }[];
  children?: React.ReactNode;
}

export const SectionDashboard: React.FC<SectionDashboardProps> = ({
  title,
  subtitle,
  icon,
  badge,
  kpis,
  kpiEmptyText,
  chapterId,
  cards,
  children,
}) => (
  <div className="page-shell">
    <PageHeader icon={icon} title={title} subtitle={subtitle} badge={badge} />
    {chapterId ? <ChapterChrome chapterId={chapterId} /> : (
      <p className="text-[11px] font-mono text-slate-500 -mt-2">OEH / AIRAH chapter · GUIDE_POTENTIAL is not measured LIVE kW</p>
    )}

    {kpis && kpis.length > 0 && <KPIGrid items={kpis} emptyText={kpiEmptyText} />}

    <div>
      <div className="section-heading mb-3">
        <h2 className="section-heading-label">Opportunities</h2>
        <span className="text-[11px] font-mono text-slate-600">{cards.length} modules</span>
      </div>
      <div
        className={`grid grid-cols-1 md:grid-cols-2 ${cards.length >= 5 ? 'xl:grid-cols-3' : cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}
      >
        {cards.map((c) => (
          <OpportunityCard
            key={c.def.id}
            code={c.def.id}
            title={c.def.title}
            href={c.href || c.def.route}
            status={c.status}
            fields={c.fields}
            emptyTitle={c.emptyTitle}
            emptyDetail={c.emptyDetail}
            telemetryLabel={c.telemetryLabel}
            maxFields={c.maxFields}
          />
        ))}
      </div>
    </div>
    {children}
  </div>
);
