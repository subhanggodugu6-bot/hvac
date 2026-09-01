'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api/client';
import { LIVE_POLL_MS, PLATFORM_POLL_MS } from '@/lib/hvac/poll';

export const ModelStatusPanel: React.FC<{ opportunities?: any[] }> = ({ opportunities }) => {
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<any | null>(null);

  const { data: modelStatus } = useQuery({
    queryKey: ['model-status'],
    queryFn: async () => {
      try {
        return await apiJson('/agents/scheduling/model-status');
      } catch {
        return null;
      }
    },
    refetchInterval: PLATFORM_POLL_MS,
  });

  const { data: workerStatus } = useQuery({
    queryKey: ['worker-status'],
    queryFn: async () => {
      try {
        return await apiJson('/agents/scheduling/worker-status');
      } catch {
        return null;
      }
    },
    refetchInterval: LIVE_POLL_MS,
  });

  const workerRunning = Boolean(workerStatus?.worker_running);
  const workerLabel = workerRunning
    ? 'RUNNING'
    : workerStatus?.worker_type === 'ai_pipeline'
      ? 'AI PIPELINE'
      : workerStatus
        ? 'STOPPED'
        : 'UNKNOWN';
  const workerDetail = workerRunning
    ? `Cycle #${workerStatus?.cycle_count ?? '—'} · ${workerStatus?.interval_seconds ?? '—'}s interval · ${workerStatus?.pipeline || workerStatus?.worker_type || 'worker'}`
    : workerStatus?.worker_type === 'ai_pipeline'
      ? workerStatus?.last_summary || 'AI pipeline worker idle on this host'
      : 'Demo host — control worker is stopped.';

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    try {
      const data = await apiJson('/agents/scheduling/evaluate-125', { method: 'POST' });
      setEvalResult(data);
    } catch (err) {
      console.error('Failed to run evaluations:', err);
    } finally {
      setEvaluating(false);
    }
  };

  const byId = (id: string) => (opportunities || []).find((o) => o.opportunityId === id);
  const models = [
    { code: 'O1', name: 'O1ThermalResponseModel', live: byId('O1') },
    { code: 'O2', name: 'O2ZoneResponseModel', live: byId('O2') },
    { code: 'O3', name: 'O3AHUSATModel', live: byId('O3') },
    { code: 'O4', name: 'O4PlantEfficiencyModel', live: byId('O4') },
  ];

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold text-slate-900 uppercase tracking-[0.14em]">
              Machine Learning Model Registry & Control Worker
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
              WORKER {workerLabel}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 font-mono mt-0.5">{workerDetail}</p>
        </div>

        <button
          onClick={handleRunEvaluation}
          disabled={evaluating}
          className="btn-secondary"
        >
          {evaluating ? 'Executing 125 Scenarios...' : 'Run 125 Evaluation Scenarios'}
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {models.map((m) => (
          <div key={m.code} className="kpi-tile min-h-0 font-mono text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-800">{m.code}</span>
              <span className="text-[10px] text-emerald-700 font-semibold">{m.live?.displayState || modelStatus?.[m.code]?.status || 'UNKNOWN'}</span>
            </div>
            <div className="font-sans text-slate-800 text-xs font-medium truncate">{m.name}</div>
            <div className="text-[11px] text-slate-600">Ver: <strong className="text-slate-700">{m.live?.modelVersion || modelStatus?.[m.code]?.version || '—'}</strong></div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">{m.live?.dataSource || 'NO REGISTRY METRICS'}</div>
          </div>
        ))}
      </div>

      {evalResult && (
        <div className="p-3 border-t border-slate-200 text-xs font-mono flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="text-slate-700">
            Evaluation Result: <strong className="text-emerald-700">{evalResult.passed} / {evalResult.total_scenarios} Scenarios Passed ({evalResult.success_rate_pct}%)</strong>
          </div>
          <span className="text-[11px] text-slate-500">Evaluation report written on the API host</span>
        </div>
      )}
    </div>
  );
};
