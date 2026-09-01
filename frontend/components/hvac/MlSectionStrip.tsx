'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMlModels } from '@/lib/hvac/mlApi';

export function MlSectionStrip({ opportunityIds }: { opportunityIds: string[] }) {
  const q = useQuery({
    queryKey: ['ml-models'],
    queryFn: fetchMlModels,
    staleTime: 30_000,
  });
  const byId = new Map((q.data?.models || []).map((m) => [m.opportunity_id, m]));
  return (
    <div className="kpi-tile">
      <div className="text-[10px] font-mono tracking-[0.18em] text-violet-700/80 mb-3">ML REGISTRY</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] font-mono">
        {opportunityIds.map((oid) => {
          const row = byId.get(oid);
          const status =
            !q.data && q.isError
              ? 'DATA SOURCE ERROR'
              : !row
                ? q.isLoading
                  ? '…'
                  : 'MODEL NOT AVAILABLE'
                : row.status === 'MODEL_READY' || row.status === 'REGISTERED'
                  ? row.model_id
                    ? 'MODEL PREDICTION'
                    : 'MODEL NOT AVAILABLE'
                  : row.status === 'MODEL_NOT_TRAINABLE'
                    ? 'MODEL NOT TRAINABLE'
                    : row.status;
          return (
            <div key={oid} className="flex justify-between gap-2 border border-slate-200 px-2 py-1.5">
              <span className="text-cyan-800">{oid}</span>
              <span className="text-slate-700 truncate">{status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
