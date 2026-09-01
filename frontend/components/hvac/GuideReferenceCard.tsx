'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api/client';
import { officialGuideId } from '@/lib/hvac/oehGuideApi';

export interface GuideCatalogRecord {
  opportunity_id: string;
  title: string;
  section: string;
  guide_page: number;
  strategy_summary: string;
  equipment_applicability: string[];
  benefits: string[];
  risks: string[];
  guide_savings_potential: string | null;
  energy_impact_class?: string;
  control_kind: string;
  source_reference: {
    document: string;
    publisher: string;
    page: number;
    opportunity: string;
  };
}

async function fetchGuideCatalog(oid: string): Promise<GuideCatalogRecord> {
  return apiJson(`/v1/guide-catalog/${oid}`) as Promise<GuideCatalogRecord>;
}

function GuideReferenceInner({ opportunityId }: { opportunityId: string }) {
  const search = useSearchParams();
  const oid = officialGuideId(opportunityId, search.get('mode') || undefined);
  const q = useQuery({
    queryKey: ['guide-catalog', oid],
    queryFn: () => fetchGuideCatalog(oid!),
    enabled: Boolean(oid),
    staleTime: 60_000,
  });

  if (!oid) return null;
  if (q.isError) {
    return (
      <section className="kpi-tile kpi-tile-flush" aria-label="OEH / AIRAH Guide">
        <div className="text-[10px] font-mono tracking-[0.18em] text-amber-800/80">GUIDE REFERENCE</div>
        <p className="text-[11px] text-slate-500 mt-2">DATA SOURCE ERROR — guide catalog unavailable.</p>
      </section>
    );
  }
  if (!q.data) {
    return (
      <section className="kpi-tile kpi-tile-flush" aria-label="OEH / AIRAH Guide">
        <div className="text-[10px] font-mono tracking-[0.18em] text-slate-500">GUIDE REFERENCE</div>
        <p className="text-[11px] text-slate-500 mt-2">Loading OEH / AIRAH guide metadata…</p>
      </section>
    );
  }

  const rec = q.data;
  return (
    <section className="kpi-tile space-y-3" aria-label="OEH / AIRAH Guide">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono tracking-[0.18em] text-amber-800/90">GUIDE REFERENCE</div>
          <h2 className="text-sm text-slate-900 mt-1">OEH / AIRAH Guide</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Educational source information — not live telemetry, not measured savings.
          </p>
        </div>
        <span className="text-[10px] font-mono px-2 py-1 rounded border border-slate-200 text-slate-600">
          {rec.energy_impact_class ?? 'GUIDE_POTENTIAL'}
        </span>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
        <div>
          <dt className="text-slate-500">Opportunity</dt>
          <dd className="text-slate-800">
            {rec.opportunity_id} {rec.title}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Guide section / page</dt>
          <dd className="text-slate-800">
            {rec.section} · p. {rec.guide_page}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-slate-500">Strategy summary</dt>
          <dd className="text-slate-700">{rec.strategy_summary || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Applicability</dt>
          <dd className="text-slate-700">{rec.equipment_applicability?.join('; ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Guide potential</dt>
          <dd className="text-slate-700">{rec.guide_savings_potential || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Benefits</dt>
          <dd className="text-slate-700">{rec.benefits?.join('; ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Risks</dt>
          <dd className="text-slate-700">{rec.risks?.join('; ') || '—'}</dd>
        </div>
      </dl>
      <p className="text-[10px] font-mono text-slate-600">
        {rec.source_reference?.document} · {rec.source_reference?.publisher} · {rec.source_reference?.opportunity} p.
        {rec.source_reference?.page}
      </p>
    </section>
  );
}

export function GuideReferenceCard({ opportunityId }: { opportunityId: string }) {
  return (
    <Suspense fallback={<div className="kpi-tile kpi-tile-flush text-[11px] text-slate-500">GUIDE REFERENCE</div>}>
      <GuideReferenceInner opportunityId={opportunityId} />
    </Suspense>
  );
}
