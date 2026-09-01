'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain } from 'lucide-react';
import { apiJson } from '@/lib/api/client';
import { StatusBadge } from '@/components/hvac/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/hvac/EmptyState';
import {
  EngineeringChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  CHART_COLORS,
  EngineeringTooltip,
} from '@/components/hvac/EngineeringChart';

type Filter =
  | 'all'
  | 'MODEL_READY'
  | 'MODEL_NOT_AVAILABLE'
  | 'MODEL_NOT_TRAINABLE'
  | 'TRAINING'
  | 'TRAINING_FAILED'
  | 'DATASET_INVALID';

type LstmSeriesKey = 'zone_temp' | 'hvac_power' | 'energy' | 'occupancy';

interface HealthRow {
  opportunity_id: string;
  agent_id?: string | null;
  dataset_id?: string | null;
  dataset_name?: string | null;
  dataset_status?: string | null;
  dataset_quality?: { missing_pct?: number | null; files?: number; sample_rows?: number } | null;
  feature_map?: Record<string, string>;
  target?: string | null;
  model_id?: string | null;
  model_version?: string | null;
  status: string;
  validation_status?: string | null;
  metrics?: { validation?: Record<string, number | null>; test?: Record<string, number | null> } | null;
  last_trained?: string | null;
  prediction_availability?: string | null;
  provenance?: string | null;
  notes?: string | null;
  missing_dataset?: string | null;
  last_prediction?: { provenance?: string; source?: string; status?: string; created_at?: string } | null;
  training_run?: { status?: string; reason?: string; algorithm?: string; metrics?: unknown } | null;
}

function fmtMetrics(m: Record<string, number | null> | undefined) {
  if (!m) return '—';
  return Object.entries(m)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(3) : v}`)
    .join(' ') || '—';
}

function lstmTone(status?: string): 'live' | 'warn' | 'danger' | 'muted' {
  if (status === 'MODEL_READY') return 'live';
  if (status === 'MODEL_NOT_READY' || status === 'INSUFFICIENT_SEQUENCE') return 'warn';
  if (status === 'TORCH_REQUIRED') return 'danger';
  return 'muted';
}

export default function MlRegistryPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string>('O1');
  const [lstmTarget, setLstmTarget] = useState<LstmSeriesKey>('zone_temp');
  const [safeRlBusy, setSafeRlBusy] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [rulesBusy, setRulesBusy] = useState(false);
  const [rulesResult, setRulesResult] = useState<{
    verdict: string;
    code: string;
    reason: string;
    checks: Array<{
      check_name: string;
      result: string;
      reason: string;
      actual_value?: number | null;
      minimum?: number | null;
      maximum?: number | null;
    }>;
  } | null>(null);
  const q = useQuery({
    queryKey: ['ml-health'],
    queryFn: () => apiJson('/ml/health') as Promise<{ opportunities: HealthRow[]; source: string; datasets: unknown[] }>,
    staleTime: 15_000,
    retry: 2,
  });

  const rls = useQuery({
    queryKey: ['rls-status'],
    queryFn: () =>
      apiJson('/platform/ai/rls/status') as Promise<{
        models: Array<{
          model_key: string;
          zone_id: string;
          source_mode: string;
          status: string;
          n_updates: number;
          last_error: number | null;
          rmse_ewma: number | null;
          last_predicted: number | null;
          last_actual: number | null;
          version: number;
          updated_at: string | null;
        }>;
        min_updates_ready: number;
      }>,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });

  const lstmStatus = useQuery({
    queryKey: ['lstm-status'],
    queryFn: () =>
      apiJson('/platform/ai/lstm/status') as Promise<{
        models: Array<{
          target: string;
          field: string;
          model_id: string;
          status: string;
          model_version: string | null;
          metrics: Record<string, number> | null;
        }>;
        torch: boolean;
      }>,
    staleTime: 20_000,
    refetchInterval: 45_000,
    retry: 1,
  });

  const lstmForecast = useQuery({
    queryKey: ['lstm-forecast'],
    queryFn: () =>
      apiJson('/platform/ai/lstm/forecast?zone_id=ZONE-01&lookback_min=60') as Promise<{
        now: string;
        horizons_min: number[];
        series: Record<
          string,
          {
            points: Array<{ horizon_min: number; t: string; yhat: number }>;
            actual_lookback: Array<{ t: string; y: number }>;
            field: string;
          } | null
        >;
        status: Record<string, { status: string; model_id?: string }>;
        wrote_setpoints: boolean;
        provenance: string;
      }>,
    staleTime: 20_000,
    refetchInterval: 45_000,
    retry: 1,
  });

  const safeRlStatus = useQuery({
    queryKey: ['safe-rl-status'],
    queryFn: () =>
      apiJson('/platform/ai/safe-rl/status?zone_id=ZONE-01') as Promise<{
        readiness: string;
        telemetry_ok: boolean;
        rls_ready: boolean;
        lstm_ready: boolean;
        safe_mode: boolean;
        last_decision: {
          decision_id?: string;
          status?: string;
          score?: number | null;
          confidence?: number | null;
          chosen_action?: {
            action_id?: string;
            label?: string;
            mapped_opportunity?: string;
            score?: number;
          } | null;
          rejected_actions?: Array<{ action_id?: string; reason?: string; score?: number }>;
          mapped_commands?: Array<{ command_id?: string; opportunity?: string; status?: string }>;
        } | null;
        wrote_setpoints: boolean;
      }>,
    staleTime: 20_000,
    refetchInterval: 45_000,
    retry: 1,
  });

  const rulesAudit = useQuery({
    queryKey: ['rules-audit'],
    queryFn: () =>
      apiJson('/platform/rules/audit?limit=10') as Promise<{
        audits: Array<{
          id: number;
          action: string;
          decision: string | null;
          reason: string | null;
          timestamp: string | null;
          payload_json?: { checks?: unknown; code?: string; point_id?: string };
        }>;
        count: number;
      }>,
    staleTime: 20_000,
    refetchInterval: 45_000,
    retry: 1,
  });

  const rows = useMemo(() => q.data?.opportunities || [], [q.data]);
  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'TRAINING') return rows.filter((r) => r.status === 'TRAINING');
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);
  const detail = rows.find((r) => r.opportunity_id === selected) || filtered[0];

  const lstmChartData = useMemo(() => {
    const series = lstmForecast.data?.series?.[lstmTarget];
    if (!series) return [];
    const actual = (series.actual_lookback || []).map((p) => ({
      t: String(p.t || '').slice(11, 16) || String(p.t || '').slice(-8, -3),
      actual: p.y,
      forecast: null as number | null,
    }));
    const forecastPts = (series.points || []).map((p) => ({
      t: `+${p.horizon_min}m`,
      actual: null as number | null,
      forecast: p.yhat,
    }));
    return [...actual, ...forecastPts];
  }, [lstmForecast.data, lstmTarget]);

  async function runSafeRlRecommend() {
    setSafeRlBusy(true);
    try {
      await apiJson('/platform/ai/safe-rl/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: 'ZONE-01' }),
      });
      await queryClient.invalidateQueries({ queryKey: ['safe-rl-status'] });
      await queryClient.invalidateQueries({ queryKey: ['rules-audit'] });
    } finally {
      setSafeRlBusy(false);
    }
  }

  async function runRulesEvaluate() {
    setRulesBusy(true);
    try {
      const chosen = safeRlStatus.data?.last_decision?.chosen_action as
        | {
            point_id?: string;
            old_value?: number;
            new_value?: number;
            mapped_opportunity?: string;
          }
        | null
        | undefined;
      const body = chosen?.point_id
        ? {
            point_id: chosen.point_id,
            old_value: chosen.old_value ?? null,
            new_value: chosen.new_value ?? null,
            opportunity_id: chosen.mapped_opportunity || 'SAFE_RL',
            zone_id: 'ZONE-01',
            action: 'EVALUATE',
          }
        : {
            point_id: 'ZONE-01.cooling_setpoint',
            old_value: 24.0,
            new_value: 24.0,
            opportunity_id: 'SAFE_RL',
            zone_id: 'ZONE-01',
            action: 'EVALUATE',
          };
      const res = (await apiJson('/platform/rules/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })) as typeof rulesResult;
      setRulesResult(res);
      await queryClient.invalidateQueries({ queryKey: ['rules-audit'] });
    } finally {
      setRulesBusy(false);
    }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'MODEL_READY', label: 'Model Ready' },
    { id: 'MODEL_NOT_AVAILABLE', label: 'Not Available' },
    { id: 'MODEL_NOT_TRAINABLE', label: 'Not Trainable' },
    { id: 'TRAINING', label: 'Training' },
    { id: 'TRAINING_FAILED', label: 'Failed' },
    { id: 'DATASET_INVALID', label: 'Dataset Invalid' },
  ];

  const seriesToggles: { id: LstmSeriesKey; label: string }[] = [
    { id: 'zone_temp', label: 'Zone temp' },
    { id: 'hvac_power', label: 'HVAC power' },
    { id: 'energy', label: 'Energy' },
    { id: 'occupancy', label: 'Occupancy' },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={Brain}
        title="HVAC ML Registry & Model Health"
        subtitle="Training/reference models for O1–O20. Provenance is MODEL PREDICTION only — never LIVE BMS."
        badge="MODEL PREDICTION"
      />

      <section className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">Online RLS learning</div>
            <p className="text-[12px] text-slate-400 mt-1">
              Stage C continuous adaptation (zone thermal + HVAC power). Read-only — never writes setpoints.
            </p>
          </div>
          <StatusBadge tone={rls.isError ? 'danger' : rls.isLoading ? 'muted' : 'live'} pulse={false}>
            {rls.isError ? 'UNAVAILABLE' : rls.isLoading ? 'LOADING' : 'ACTIVE'}
          </StatusBadge>
        </div>
        {(rls.data?.models || []).length === 0 && !rls.isLoading ? (
          <EmptyState title="No RLS updates yet" detail="Models warm up after normalized GOOD samples arrive (poll or job worker tick)." />
        ) : (
          <div className="overflow-x-auto">
            <table className="bms-table">
              <thead className="text-slate-500 text-left">
                <tr className="border-b border-slate-200">
                  <th className="p-2">Model</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Updates</th>
                  <th className="p-2">Last error</th>
                  <th className="p-2">RMSE EWMA</th>
                  <th className="p-2">Pred / Actual</th>
                  <th className="p-2">Version</th>
                </tr>
              </thead>
              <tbody>
                {(rls.data?.models || []).map((m) => (
                  <tr key={`${m.source_mode}-${m.zone_id}-${m.model_key}`} className="border-b border-slate-200">
                    <td className="p-2 font-mono text-cyan-800">{m.model_key}</td>
                    <td className="p-2 text-[12px]">{m.source_mode}</td>
                    <td className="p-2">
                      <StatusBadge tone={m.status === 'READY' ? 'live' : 'warn'} pulse={false}>
                        {m.status}
                      </StatusBadge>
                    </td>
                    <td className="p-2 text-[12px]">{m.n_updates}</td>
                    <td className="p-2 text-[12px]">{m.last_error == null ? '—' : m.last_error.toFixed(3)}</td>
                    <td className="p-2 text-[12px]">{m.rmse_ewma == null ? '—' : m.rmse_ewma.toFixed(3)}</td>
                    <td className="p-2 text-[12px] font-mono">
                      {m.last_predicted == null ? '—' : m.last_predicted.toFixed(2)}
                      {' / '}
                      {m.last_actual == null ? '—' : m.last_actual.toFixed(2)}
                    </td>
                    <td className="p-2 text-[12px]">{m.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">LSTM forecast</div>
            <p className="text-[12px] text-slate-400 mt-1">
              Stage D multi-horizon advisory forecast (15–60 min). MODEL PREDICTION only — never LIVE BMS write.
            </p>
          </div>
          <StatusBadge
            tone={lstmForecast.isError ? 'danger' : lstmForecast.isLoading ? 'muted' : 'live'}
            pulse={false}
          >
            {lstmForecast.isError ? 'UNAVAILABLE' : lstmForecast.isLoading ? 'LOADING' : 'ADVISORY'}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap gap-2">
          {(lstmStatus.data?.models || []).map((m) => (
            <StatusBadge key={m.model_id} tone={lstmTone(m.status)} pulse={false}>
              {m.target}: {m.status}
              {m.model_version ? ` (${m.model_version})` : ''}
            </StatusBadge>
          ))}
          {lstmStatus.data && !lstmStatus.data.torch ? (
            <StatusBadge tone="warn" pulse={false}>
              TORCH OPTIONAL
            </StatusBadge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {seriesToggles.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setLstmTarget(t.id)}
              className={`chip-filter ${lstmTarget === t.id ? 'chip-filter-on' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!lstmForecast.data?.series?.[lstmTarget] && !lstmForecast.isLoading ? (
          <EmptyState
            title="No LSTM forecast yet"
            detail="Train with POST /api/platform/ai/lstm/train (requires torch) once enough GOOD/STALE normalized samples exist."
          />
        ) : (
          <EngineeringChart height={240}>
            <LineChart data={lstmChartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fill: CHART_COLORS.axis, fontSize: 10 }} />
              <YAxis tick={{ fill: CHART_COLORS.axis, fontSize: 10 }} />
              <Tooltip content={<EngineeringTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual (lookback)"
                stroke={CHART_COLORS.current}
                dot={false}
                connectNulls={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke={CHART_COLORS.optimized}
                strokeDasharray="4 4"
                dot
                connectNulls={false}
                strokeWidth={2}
              />
            </LineChart>
          </EngineeringChart>
        )}
        <p className="text-[11px] text-slate-500">
          Horizons: {(lstmForecast.data?.horizons_min || [15, 30, 45, 60]).join(' / ')} min · wrote_setpoints=
          {String(lstmForecast.data?.wrote_setpoints ?? false)}
        </p>
      </section>

      <section className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">
              NB2 Optimizer (Safe RL)
            </div>
            <p className="text-[12px] text-slate-400 mt-1">
              Stage E constrained recommend from RLS + LSTM + limits. RECOMMENDATION ONLY — plant does not move.
            </p>
          </div>
          <StatusBadge
            tone={
              safeRlStatus.data?.safe_mode
                ? 'danger'
                : safeRlStatus.data?.readiness === 'READY'
                  ? 'live'
                  : safeRlStatus.data?.last_decision?.status === 'PROPOSED'
                    ? 'live'
                    : 'warn'
            }
            pulse={false}
          >
            {safeRlStatus.data?.last_decision?.status ||
              safeRlStatus.data?.readiness ||
              (safeRlStatus.isLoading ? 'LOADING' : 'ADVISORY')}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap gap-2 text-[12px]">
          <StatusBadge tone={safeRlStatus.data?.telemetry_ok ? 'live' : 'warn'} pulse={false}>
            telemetry {safeRlStatus.data?.telemetry_ok ? 'OK' : 'MISSING'}
          </StatusBadge>
          <StatusBadge tone={safeRlStatus.data?.rls_ready ? 'live' : 'muted'} pulse={false}>
            RLS {safeRlStatus.data?.rls_ready ? 'READY' : 'WARMING'}
          </StatusBadge>
          <StatusBadge tone={safeRlStatus.data?.lstm_ready ? 'live' : 'muted'} pulse={false}>
            LSTM {safeRlStatus.data?.lstm_ready ? 'READY' : 'N/A'}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={safeRlBusy || safeRlStatus.data?.safe_mode}
            onClick={() => void runSafeRlRecommend()}
            className="chip-filter chip-filter-on disabled:opacity-50"
          >
            {safeRlBusy ? 'Running…' : 'Run recommend'}
          </button>
          <button
            type="button"
            onClick={() => setShowRejected((v) => !v)}
            className="chip-filter"
          >
            {showRejected ? 'Hide rejected' : 'Show rejected'}
          </button>
        </div>

        {safeRlStatus.data?.last_decision ? (
          <div className="space-y-2 text-[12px]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <div className="text-slate-500">Chosen action</div>
                <div className="text-slate-800 font-mono">
                  {safeRlStatus.data.last_decision.chosen_action?.action_id || '—'}{' '}
                  {safeRlStatus.data.last_decision.chosen_action?.mapped_opportunity
                    ? `→ ${safeRlStatus.data.last_decision.chosen_action.mapped_opportunity}`
                    : ''}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Score / confidence</div>
                <div className="text-slate-800">
                  {safeRlStatus.data.last_decision.score == null
                    ? '—'
                    : safeRlStatus.data.last_decision.score.toFixed(3)}{' '}
                  /{' '}
                  {safeRlStatus.data.last_decision.confidence == null
                    ? '—'
                    : safeRlStatus.data.last_decision.confidence.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Mapped commands</div>
                <div className="text-slate-800 font-mono">
                  {(safeRlStatus.data.last_decision.mapped_commands || [])
                    .map((c) => `${c.opportunity}:${c.command_id?.slice(0, 8)}`)
                    .join(' · ') || '— (hold or blocked)'}
                </div>
              </div>
            </div>
            {showRejected && (safeRlStatus.data.last_decision.rejected_actions || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="bms-table">
                  <thead className="text-slate-500 text-left">
                    <tr className="border-b border-slate-200">
                      <th className="p-2">Action</th>
                      <th className="p-2">Reason</th>
                      <th className="p-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(safeRlStatus.data.last_decision.rejected_actions || []).map((r) => (
                      <tr key={r.action_id} className="border-b border-slate-200">
                        <td className="p-2 font-mono text-cyan-800">{r.action_id}</td>
                        <td className="p-2">{r.reason}</td>
                        <td className="p-2">{r.score == null ? '—' : r.score.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="No Safe RL decision yet"
            detail="Run recommend once normalized GOOD/STALE telemetry is available."
          />
        )}
        <p className="text-[11px] text-slate-500">
          wrote_setpoints={String(safeRlStatus.data?.wrote_setpoints ?? false)} · status PROPOSED only in Stage E
        </p>
      </section>

      <section className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">
              Rule Engine
            </div>
            <p className="text-[12px] text-slate-400 mt-1">
              Stage F checklist (R01–R10). No BMS write without APPROVED — writes still off until Stage G.
            </p>
          </div>
          <StatusBadge
            tone={
              rulesResult?.verdict === 'APPROVED'
                ? 'live'
                : rulesResult?.verdict === 'REJECTED'
                  ? 'danger'
                  : 'muted'
            }
            pulse={false}
          >
            {rulesResult?.verdict || 'IDLE'}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={rulesBusy}
            onClick={() => void runRulesEvaluate()}
            className="chip-filter chip-filter-on disabled:opacity-50"
          >
            {rulesBusy ? 'Evaluating…' : 'Evaluate last Safe RL action'}
          </button>
        </div>

        {rulesResult ? (
          <div className="space-y-2 text-[12px]">
            <div className="text-slate-700">
              <span className="text-slate-500">Code:</span> {rulesResult.code}{' '}
              <span className="text-slate-500">·</span> {rulesResult.reason}
            </div>
            <div className="overflow-x-auto">
              <table className="bms-table">
                <thead className="text-slate-500 text-left">
                  <tr className="border-b border-slate-200">
                    <th className="p-2">Check</th>
                    <th className="p-2">Result</th>
                    <th className="p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(rulesResult.checks || []).map((c) => (
                    <tr key={c.check_name} className="border-b border-slate-200">
                      <td className="p-2 font-mono text-cyan-800">{c.check_name}</td>
                      <td className="p-2">
                        <StatusBadge tone={c.result === 'PASS' ? 'live' : 'danger'} pulse={false}>
                          {c.result}
                        </StatusBadge>
                      </td>
                      <td className="p-2 text-slate-700">{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No Rule Engine evaluation yet"
            detail="Run evaluate against the last Safe RL action (or default zone SP hold)."
          />
        )}

        {(rulesAudit.data?.audits || []).length > 0 ? (
          <div className="text-[11px] text-slate-500">
            Recent audits:{' '}
            {(rulesAudit.data?.audits || [])
              .slice(0, 3)
              .map((a) => `${a.action.replace('RULE_ENGINE_', '')}@${(a.timestamp || '').slice(11, 19)}`)
              .join(' · ')}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`chip-filter ${filter === f.id ? 'chip-filter-on' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.some((r) => r.missing_dataset) ? (
        <section className="glass-card p-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">MISSING DATASETS</div>
          <ul className="text-[12px] space-y-1 text-slate-700">
            {rows
              .filter((r) => r.missing_dataset)
              .map((r) => (
                <li key={r.opportunity_id}>
                  <span className="text-cyan-400 font-mono">{r.opportunity_id}</span> {r.missing_dataset}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      {q.isError && rows.length === 0 ? (
        <EmptyState
          title="DATA SOURCE ERROR"
          detail="ML registry unavailable."
          onRetry={() => q.refetch()}
        />
      ) : null}

      <div className="overflow-x-auto glass-card">
        <table className="bms-table">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Opportunity</th>
              <th className="p-2">Agent</th>
              <th className="p-2">Dataset</th>
              <th className="p-2">Dataset quality</th>
              <th className="p-2">Feature map</th>
              <th className="p-2">Target</th>
              <th className="p-2">Model</th>
              <th className="p-2">Model version</th>
              <th className="p-2">Status</th>
              <th className="p-2">Validation status</th>
              <th className="p-2">Confidence/metrics</th>
              <th className="p-2">Last trained</th>
              <th className="p-2">Prediction availability</th>
              <th className="p-2">Provenance</th>
              <th className="p-2">Missing dataset</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.opportunity_id}
                onClick={() => setSelected(r.opportunity_id)}
                className={`border-b border-slate-200 cursor-pointer ${
                  selected === r.opportunity_id ? 'bg-cyan-500/[0.08]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <td className="p-2 text-cyan-400">{r.opportunity_id}</td>
                <td className="p-2 text-slate-700">{r.agent_id || '—'}</td>
                <td className="p-2 text-slate-700">{r.dataset_id || '—'}</td>
                <td className="p-2 text-slate-400">
                  {r.dataset_quality?.missing_pct == null ? '—' : `miss ${r.dataset_quality.missing_pct}%`}
                </td>
                <td className="p-2 text-slate-400 max-w-[9rem] truncate" title={JSON.stringify(r.feature_map || {})}>
                  {r.feature_map && Object.keys(r.feature_map).length ? Object.keys(r.feature_map).join(', ') : '—'}
                </td>
                <td className="p-2 text-slate-400 max-w-[10rem] truncate">{r.target || '—'}</td>
                <td className="p-2 text-slate-700">{r.model_id || '—'}</td>
                <td className="p-2 text-slate-700">{r.model_version || '—'}</td>
                <td className="p-2">
                  <StatusBadge tone={r.status === 'MODEL_READY' ? 'live' : 'muted'} pulse={false}>
                    {r.status}
                  </StatusBadge>
                </td>
                <td className="p-2 text-slate-400">{r.validation_status || '—'}</td>
                <td className="p-2 text-slate-400">{fmtMetrics(r.metrics?.validation)}</td>
                <td className="p-2 text-slate-400">{r.last_trained || '—'}</td>
                <td className="p-2 text-slate-400">{r.prediction_availability || '—'}</td>
                <td className="p-2 text-violet-700">
                  {r.provenance === 'LIVE' || r.provenance === 'LIVE_BMS' ? 'TRAINING DATA' : r.provenance}
                </td>
                <td className="p-2 text-amber-300 max-w-[14rem] truncate" title={r.missing_dataset || ''}>
                  {r.missing_dataset || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && filtered.length === 0 ? (
          <EmptyState
            title="NO DATA"
            detail={
              rows.length === 0
                ? 'No ML registry rows were returned.'
                : `No opportunities in this filter (${rows.length} in registry). Switch to All.`
            }
          />
        ) : null}
      </div>

      {detail ? (
        <section className="glass-card p-4 space-y-3">
          <div className="text-[10px] font-mono tracking-[0.18em] text-violet-700">OPPORTUNITY DETAIL · {detail.opportunity_id}</div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
            <div>
              <dt className="text-slate-500">Dataset provenance</dt>
              <dd className="text-slate-800">
                TRAINING_DATASET · {detail.dataset_id || '—'} · {detail.dataset_status || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Target</dt>
              <dd className="text-slate-800">{detail.target || 'MODEL NOT TRAINABLE'}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-slate-500">Feature map</dt>
              <dd className="text-slate-700 font-mono text-[11px]">
                {detail.feature_map && Object.keys(detail.feature_map).length
                  ? JSON.stringify(detail.feature_map)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Training run</dt>
              <dd className="text-slate-800">
                {detail.training_run?.status || '—'} {detail.training_run?.algorithm ? `· ${detail.training_run.algorithm}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Validation</dt>
              <dd className="text-slate-800">{detail.validation_status} · {fmtMetrics(detail.metrics?.validation)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Prediction status</dt>
              <dd className="text-slate-800">{detail.prediction_availability}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last prediction</dt>
              <dd className="text-slate-800">
                {detail.last_prediction
                  ? `${
                      detail.last_prediction.provenance === 'LIVE' || detail.last_prediction.provenance === 'LIVE_BMS'
                        ? 'MODEL PREDICTION'
                        : detail.last_prediction.provenance
                    } · ${detail.last_prediction.created_at || ''}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">ML provenance</dt>
              <dd className="text-slate-800">TRAINING DATA · never LIVE BMS</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-slate-500">Model metrics</dt>
              <dd className="text-slate-700 font-mono text-[11px]">
                val {fmtMetrics(detail.metrics?.validation)} · test {fmtMetrics(detail.metrics?.test)}
              </dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-slate-500">Notes</dt>
              <dd className="text-slate-400">{detail.notes || '—'}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-slate-500">Missing dataset</dt>
              <dd className="text-amber-800">{detail.missing_dataset || '—'}</dd>
            </div>
          </dl>
          <p className="text-[11px] text-slate-500">
            ML is advisory. Engineering agents remain responsible for recommendations. evaluate_dispatch() remains the write gate.
          </p>
        </section>
      ) : null}
    </div>
  );
}
