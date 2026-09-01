'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { OpportunityDef } from '@/lib/hvac/opportunityConfig';
import { StatusBadge, toneForStatus } from './StatusBadge';
import { StudioModuleHeader } from './StudioModuleHeader';
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
  const title = `${def.title}${page ? ` · p.${page}` : ''}`;

  return (
    <StudioModuleHeader
      def={def}
      code={code}
      eyebrow="OEH / AIRAH · GUIDE_POTENTIAL is not measured LIVE kW"
      title={title}
      description={def.description}
      badges={
        <>
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
          {mlModel ? (
            <StatusBadge tone="neutral" pulse={false}>
              {mlModel}
            </StatusBadge>
          ) : null}
          {mlConfidence ? (
            <StatusBadge tone="neutral" pulse={false}>
              {mlConfidence}
            </StatusBadge>
          ) : null}
          {model ? (
            <StatusBadge tone="neutral" pulse={false}>
              {model}
            </StatusBadge>
          ) : null}
          {bms ? (
            <StatusBadge tone={toneForStatus(bms)} pulse={false}>
              {bms}
            </StatusBadge>
          ) : null}
        </>
      }
      actions={writeActions}
    />
  );
};

/** @deprecated Use StudioModuleHeader or OpportunityHeader */
export { StudioModuleHeader as StudioPageHeader } from './StudioModuleHeader';
