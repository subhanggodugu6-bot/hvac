'use client';

import React, { Suspense } from 'react';
import type { OpportunityDef } from '@/lib/hvac/opportunityConfig';
import { GUIDE_CATS, guideCatForOpportunityId } from '@/lib/hvac/guideTypes';
import { OpportunityHeader } from '@/components/hvac/OpportunityHeader';
import { StrategyGuidePanel } from '@/components/hvac/guide/StrategyGuidePanel';
import { OpportunityViewTabs, useStudioViewTab } from '@/components/hvac/guide/OpportunityViewTabs';
import { GuideReferenceCard } from '@/components/hvac/GuideReferenceCard';
import { MlPredictionPanel } from '@/components/hvac/MlPredictionPanel';
import { DispatchSafetyPanel } from '@/components/hvac/DispatchSafetyPanel';
import { CanonicalPlantPanel } from '@/components/hvac/CanonicalPlantPanel';

export function OpportunityWorkspace({
  def,
  live,
  model,
  bms,
  ml,
  mlModel,
  mlConfidence,
  actions,
  children,
  className = 'page-shell',
}: {
  def: OpportunityDef;
  live?: string | null;
  model?: string | null;
  bms?: string | null;
  ml?: string | null;
  mlModel?: string | null;
  mlConfidence?: string | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [tab, setTab] = useStudioViewTab();
  const cat = GUIDE_CATS[guideCatForOpportunityId(def.id)] || GUIDE_CATS.scheduling;

  return (
    <div className={className}>
      <div
        className="studio-chrome w-full min-w-0"
        style={{ borderTopWidth: 3, borderTopColor: cat.color }}
      >
        <Suspense fallback={<div className="kpi-tile kpi-tile-flush text-[11px] font-mono text-slate-500">Loading header…</div>}>
          <OpportunityHeader def={def} live={live} model={model} bms={bms} ml={ml} mlModel={mlModel} mlConfidence={mlConfidence} actions={actions} />
        </Suspense>
        <OpportunityViewTabs tab={tab} onChange={setTab} color={cat.color} />
      </div>
      {tab === 'guide' ? (
        <Suspense fallback={<div className="kpi-tile kpi-tile-flush text-[11px] font-mono text-slate-500">Loading OEH guide…</div>}>
          <StrategyGuidePanel opportunityId={def.id} />
        </Suspense>
      ) : (
        <>
          {children}
          <CanonicalPlantPanel opportunityId={def.id} />
          <DispatchSafetyPanel opportunityId={def.id} />
          <Suspense fallback={null}>
            <MlPredictionPanel opportunityId={def.id} />
          </Suspense>
          <GuideReferenceCard opportunityId={def.id} />
        </>
      )}
    </div>
  );
}

export function OpportunityGridChrome({
  opportunityId,
  hero,
  children,
}: {
  opportunityId: string;
  hero: React.ReactNode;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useStudioViewTab();
  const cat = GUIDE_CATS[guideCatForOpportunityId(opportunityId)] || GUIDE_CATS.variablespeed;

  return (
    <div className="col-span-12 w-full min-w-0 space-y-6">
      <div
        className="studio-chrome w-full min-w-0"
        style={{ borderTopWidth: 3, borderTopColor: cat.color }}
      >
        {hero}
        <OpportunityViewTabs tab={tab} onChange={setTab} color={cat.color} />
      </div>
      {tab === 'guide' ? (
        <Suspense fallback={<div className="kpi-tile kpi-tile-flush text-[11px] font-mono text-slate-500">Loading OEH guide…</div>}>
          <StrategyGuidePanel opportunityId={opportunityId} />
        </Suspense>
      ) : (
        <>
          <div className="grid w-full min-w-0 grid-cols-1 xl:grid-cols-12 gap-4">{children}</div>
          <CanonicalPlantPanel opportunityId={opportunityId} />
          <DispatchSafetyPanel opportunityId={opportunityId} />
          <Suspense fallback={null}>
            <MlPredictionPanel opportunityId={opportunityId} />
          </Suspense>
          <GuideReferenceCard opportunityId={opportunityId} />
        </>
      )}
    </div>
  );
}
