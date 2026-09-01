'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { OpportunityDef } from '@/lib/hvac/opportunityConfig';
import { StatusBadge, toneForStatus } from './StatusBadge';
import { StudioBreadcrumb } from './StudioBreadcrumb';
import { officialGuideId } from '@/lib/hvac/oehGuideApi';
import { hvacFetch } from '@/lib/api/client';

interface OpportunityHeaderProps {
  def: OpportunityDef;
  live?: string | null;
  model?: string | null;
  bms?: string | null;
  ml?: string | null;
  mlModel?: string | null;
  mlConfidence?: string | null;
  actions?: React.ReactNode;
}

export const OpportunityHeader: React.FC<OpportunityHeaderProps> = ({
  def,
  live,
  model,
  bms,
  ml,
  mlModel,
  mlConfidence,
  actions,
}) => {
  const search = useSearchParams();
  const oid = officialGuideId(def.id, search.get('mode') || undefined);
  const catalog = useQuery({
    queryKey: ['guide-catalog', oid],
    queryFn: async () => (await hvacFetch(`/api/v1/guide-catalog/${oid}`)).json(),
    enabled: Boolean(oid),
    staleTime: 60_000,
  });
  const page = catalog.data?.guide_page;
  const pot = String(catalog.data?.guide_savings_potential || catalog.data?.guide_potential || '');
  const pctMatch = pot.match(/(\d+)\s*%/);
  const guideBadge = pctMatch ? `GUIDE up to ${pctMatch[1]}%` : pot ? `GUIDE ${pot}` : null;
  const kind = String(catalog.data?.control_kind || '').toLowerCase();
  const advisory = kind === 'advisory' || ['O9', 'O17', 'O18', 'O19', 'O20'].includes(oid || '');
  const writeActions = advisory ? undefined : actions;
  const code = oid || def.id;

  return (
    <div className="px-5 pt-5 pb-4">
      <StudioBreadcrumb def={def} />
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mt-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-violet-600 mb-1.5">
            OEH / AIRAH · GUIDE_POTENTIAL is not measured LIVE kW
          </div>
          <h1 className="text-[1.7rem] font-bold text-slate-900 tracking-tight leading-tight">
            {code} · {def.title}
            {page ? ` · p.${page}` : ''}
          </h1>
          <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl leading-relaxed">{def.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            <StatusBadge tone={toneForStatus(live)} pulse={live === 'LIVE'}>
              Telemetry {live || 'NO DATA'}
            </StatusBadge>
            {guideBadge ? (
              <StatusBadge tone="neutral" pulse={false}>
                {guideBadge}
              </StatusBadge>
            ) : null}
            <StatusBadge tone="neutral" pulse={false}>
              ML {ml && ml !== 'LIVE' ? ml : ml || 'NO DATA'}
            </StatusBadge>
            {mlModel && (
              <StatusBadge tone="neutral" pulse={false}>
                {mlModel}
              </StatusBadge>
            )}
            {mlConfidence && (
              <StatusBadge tone="neutral" pulse={false}>
                {mlConfidence}
              </StatusBadge>
            )}
            {model && (
              <StatusBadge tone="neutral" pulse={false}>
                {model}
              </StatusBadge>
            )}
            {bms && (
              <StatusBadge tone={toneForStatus(bms)} pulse={false}>
                {bms}
              </StatusBadge>
            )}
          </div>
        </div>
        {writeActions && <div className="flex flex-wrap gap-2 shrink-0">{writeActions}</div>}
      </div>
    </div>
  );
};
