'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMlModel, postMlPredict } from '@/lib/hvac/mlApi';
import { officialGuideId } from '@/lib/hvac/oehGuideApi';
import { useSearchParams } from 'next/navigation';

export function MlPredictionPanel({ opportunityId }: { opportunityId: string }) {
  const search = useSearchParams();
  const oid = officialGuideId(opportunityId, search.get('mode') || undefined);
  const model = useQuery({
    queryKey: ['ml-model', oid],
    queryFn: () => fetchMlModel(oid!),
    enabled: Boolean(oid),
    staleTime: 30_000,
  });
  const pred = useQuery({
    queryKey: ['ml-predict', oid],
    queryFn: () => postMlPredict({ opportunity_id: oid!, features: {} }),
    enabled: Boolean(oid && model.data?.status === 'MODEL_READY'),
    staleTime: 15_000,
  });

  if (!oid) return null;
  const status = model.data?.status || (model.isError ? 'DATA SOURCE ERROR' : 'MODEL NOT AVAILABLE');
  const mlStatus =
    oid === 'O10' || status === 'MODEL_NOT_TRAINABLE'
      ? 'MODEL NOT TRAINABLE'
      : status === 'MODEL_READY'
        ? pred.data?.status === 'INSUFFICIENT_FEATURES'
          ? 'WAITING FOR TELEMETRY'
          : pred.data?.provenance && pred.data.provenance !== 'LIVE' && pred.data.provenance !== 'LIVE_BMS'
            ? pred.data.provenance
            : 'MODEL PREDICTION'
        : status === 'TRAINING_FAILED' || status === 'DATASET_INVALID'
          ? status === 'DATASET_INVALID'
            ? 'MODEL NOT TRAINABLE'
            : 'MODEL NOT AVAILABLE'
          : 'MODEL NOT AVAILABLE';
  const liveBlocked = mlStatus === 'LIVE' || mlStatus === 'LIVE_BMS' ? 'MODEL PREDICTION' : mlStatus;

  return (
    <section className="kpi-tile space-y-3" aria-label="ML prediction">
      <div className="text-[10px] font-mono tracking-[0.18em] text-violet-700">ML PREDICTION</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <div>
          <div className="text-slate-500">ML provenance</div>
          <div className="text-slate-900">{liveBlocked}</div>
        </div>
        <div>
          <div className="text-slate-500">Model</div>
          <div className="text-slate-900">{String(pred.data?.model_id || model.data?.model?.model_id || '—')}</div>
        </div>
        <div>
          <div className="text-slate-500">Confidence</div>
          <div className="text-slate-900">
            {pred.data?.confidence == null ? '—' : `${Math.round(Number(pred.data.confidence) * 100)}%`}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Prediction</div>
          <div className="text-slate-900">
            {pred.data?.prediction?.value != null
              ? String(pred.data.prediction.value)
              : pred.data?.prediction?.label != null
                ? String(pred.data.prediction.label)
                : 'NO MODEL PREDICTION'}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        {pred.data?.engineering_validation ||
          'Kaggle/training data is not LIVE BMS. ML cannot dispatch equipment by itself.'}
      </p>
      {pred.data?.top_features?.length ? (
        <ul className="text-[11px] font-mono text-slate-600 space-y-0.5">
          {pred.data.top_features.slice(0, 5).map((f) => (
            <li key={f.feature}>
              {f.feature}={f.value ?? '—'} importance={f.importance ?? '—'}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
