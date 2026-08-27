'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { OpportunityWorkspace } from '@/components/hvac/guide/OpportunityWorkspace';
import { KPIGrid } from '@/components/hvac/KPIGrid';
import { EmptyState } from '@/components/hvac/EmptyState';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EngineeringChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, CHART_COLORS, EngineeringTooltip } from '@/components/hvac/EngineeringChart';
import { formatCfm, formatKw, formatPercent } from '@/lib/hvac/formatters';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { fetchVentilationOpportunity } from '@/lib/hvac/ventilationApi';

type StudioState = Record<string, unknown> & {
  status?: string | null;
  telemetry?: { state?: string | null; ageSeconds?: number | null };
  current?: { values?: Record<string, unknown> };
  optimized?: { values?: Record<string, unknown> };
  current_state?: Record<string, unknown>;
  optimized_state?: Record<string, unknown>;
  energy?: { instantaneousKw?: number | null };
  energySavingKw?: number | null;
  recommendation?: { action?: string | null; rationale?: string | null } | string | null;
  reason?: string | null;
  current_value?: number | null;
  optimized_value?: number | null;
  current_airflow_cfm?: number | null;
  optimized_airflow_cfm?: number | null;
  confidence?: number | null;
  safety_status?: string | null;
  safety_checks?: { check_name?: string; reason?: string; result?: string }[];
  agent_status?: string | null;
  bms_status?: string | null;
  freshness?: string | null;
  live?: boolean;
};

function lookup(source: Record<string, unknown> | undefined, data: StudioState | null, key: string): unknown {
  if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  if (!data) return null;
  const root = data as unknown as Record<string, unknown>;
  return root[key];
}

function fmt(value: unknown, unit?: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return unit ? `${n} ${unit}` : n;
  }
  return unit ? `${String(value)} ${unit}` : String(value);
}

function FieldGrid({ title, entries }: { title: string; entries: { label: string; value: unknown; unit?: string }[] }) {
  const shown = entries.filter((e) => e.value !== null && e.value !== undefined && e.value !== '');
  if (!shown.length) return null;
  return (
    <div className="kpi-tile">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {shown.map((e) => (
          <div key={e.label}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{e.label}</div>
            <div className="text-sm font-mono text-slate-900 mt-0.5">{fmt(e.value, e.unit)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface OfficialOpportunityStudioProps {
  opportunityId: string;
  stateUrl: string;
  historyUrl?: string;
  dispatchUrl?: string;
  rollbackUrl?: string;
  currentFields: { key: string; label: string; unit?: string }[];
  optimizedFields: { key: string; label: string; unit?: string }[];
}

export const OfficialOpportunityStudio: React.FC<OfficialOpportunityStudioProps> = ({
  opportunityId,
  stateUrl,
  historyUrl,
  dispatchUrl,
  rollbackUrl,
  currentFields,
  optimizedFields,
}) => {
  const def = getOpportunity(opportunityId)!;
  const [data, setData] = useState<StudioState | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchVentilationOpportunity(opportunityId);
    if (r.data) {
      setData(r.data as unknown as StudioState);
      setError(null);
    } else {
      setData(null);
      setError(r.error === 'API ERROR' ? 'DATA SOURCE ERROR' : 'NO TELEMETRY');
    }
    setLoading(false);
    if (historyUrl) {
      try {
        const hr = await fetch(historyUrl, { cache: 'no-store' });
        if (hr.ok) {
          const body = await hr.json();
          setHistory(Array.isArray(body?.points) ? body.points : []);
        }
      } catch {
        /* history optional — must not surface as opportunity 404 */
      }
    }
  }, [opportunityId, historyUrl]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const live =
    data?.status === 'SIMULATION' || String(data?.freshness || '').toUpperCase().includes('SIMUL')
      ? 'SIMULATION'
      : data?.telemetry?.state || data?.freshness || (data?.live ? 'LIVE' : loading ? 'LOADING TELEMETRY' : undefined);
  const cs = data?.current_state || data?.current?.values || {};
  const os = data?.optimized_state || data?.optimized?.values || {};
  const hasData = Boolean(data && data.status !== 'UNAVAILABLE');

  const energyVal = data?.energySavingKw ?? data?.energy?.instantaneousKw ?? null;
  const recAction = typeof data?.recommendation === 'string' ? data.recommendation : data?.recommendation?.action;
  const recText = (typeof data?.recommendation === 'object' && data?.recommendation?.rationale) || data?.reason;

  return (
    <OpportunityWorkspace
      def={def}
      live={live}
      model={data?.agent_status}
      bms={data?.bms_status}
      actions={
        rollbackUrl ? (
          <button
            className="btn-danger"
            onClick={async () => {
              await fetch(rollbackUrl, { method: 'POST' });
              load();
            }}
          >
            Fail-Safe Rollback
          </button>
        ) : undefined
      }
    >

      {loading && <EmptyState title="LOADING TELEMETRY..." detail="Requesting opportunity state from the backend." />}
      {error && !loading && !data && (
        <EmptyState title={error} detail="No fabricated Current/Optimized values are shown while the data source is unavailable." />
      )}

      {data && (
      <KPIGrid
        emptyText={loading ? 'LOADING TELEMETRY...' : '—'}
        items={[
          {
            label: 'Current',
            value: data ? formatCfm(data.current_value ?? data.current_airflow_cfm) : null,
          },
          {
            label: 'Optimized',
            value: data ? formatCfm(data.optimized_value ?? data.optimized_airflow_cfm) : null,
          },
          { label: 'Energy', value: data ? formatKw(energyVal) : null },
          { label: 'Confidence', value: data ? formatPercent(data.confidence) : null },
          { label: 'Status', value: data ? data.status || recAction || null : null },
        ]}
      />
      )}

      {!hasData && !loading && !error && (
        <EmptyState title="TELEMETRY UNAVAILABLE" detail="Current: —  Optimized: —  Energy: —  Confidence: —" />
      )}

      {hasData && (
        <>
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            <StatusBadge tone={toneForStatus(data?.telemetry?.state || data?.freshness)}>
              {data?.telemetry?.state || data?.freshness}
              {data?.telemetry?.ageSeconds != null ? ` · ${Math.round(data.telemetry.ageSeconds)}s` : ''}
            </StatusBadge>
            <StatusBadge tone={toneForStatus(data?.safety_status)}>SAFETY {data?.safety_status || '—'}</StatusBadge>
          </div>

          <FieldGrid
            title="Current State"
            entries={currentFields.map((f) => ({ label: f.label, value: lookup(cs as Record<string, unknown>, data, f.key), unit: f.unit }))}
          />
          <FieldGrid
            title="Optimized State"
            entries={optimizedFields.map((f) => ({ label: f.label, value: lookup(os as Record<string, unknown>, data, f.key), unit: f.unit }))}
          />

          {(recAction || recText) && (
            <div className="kpi-tile">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Recommendation</div>
              {recAction && <div className="text-lg font-mono text-violet-700 mt-2">{recAction}</div>}
              {recText && <p className="text-sm text-slate-600 mt-2">{String(recText)}</p>}
              <div className="text-[11px] font-mono text-slate-500 mt-2">CONFIDENCE {formatPercent(data?.confidence)}</div>
            </div>
          )}

          {Array.isArray(data?.safety_checks) && data.safety_checks.length > 0 && (
            <div className="kpi-tile">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">
                Safety Checks
              </div>
              <div className="space-y-2">
                {data.safety_checks.map((c) => (
                  <div key={c.check_name} className="flex items-start justify-between gap-3 text-[12px]">
                    <div>
                      <div className="text-slate-800 font-medium">{c.check_name}</div>
                      <div className="text-[11px] text-slate-500">{c.reason}</div>
                    </div>
                    <StatusBadge tone={toneForStatus(c.result)}>{c.result}</StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {history.length > 1 && (
            <div className="kpi-tile">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Optimization History</div>
              <EngineeringChart height={220}>
                <LineChart data={history.map((p) => ({ ...p, t: String(p.timestamp || '').slice(11, 16) }))}>
                  <CartesianGrid stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="t" stroke={CHART_COLORS.axis} fontSize={10} />
                  <YAxis stroke={CHART_COLORS.axis} fontSize={10} />
                  <Tooltip content={<EngineeringTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="current_value" name="Current" stroke={CHART_COLORS.current} dot={false} />
                  <Line type="monotone" dataKey="optimized_value" name="Optimized" stroke={CHART_COLORS.optimized} dot={false} />
                </LineChart>
              </EngineeringChart>
            </div>
          )}

          {dispatchUrl && (
            <button
              className="btn-primary"
              disabled={data?.optimized_value == null || data?.safety_status === 'BLOCKED'}
              onClick={async () => {
                setStatus('DISPATCHING');
                const res = await fetch(dispatchUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    target_value: Number(data?.optimized_value),
                    target_speed_pct: Number(data?.optimized_value),
                    equipment_id: 'EQ-01',
                  }),
                });
                setStatus(res.ok ? 'ACKNOWLEDGED' : 'FAILED');
                setTimeout(() => setStatus(null), 4000);
              }}
            >
              {status || 'Dispatch Recommendation'}
            </button>
          )}
        </>
      )}
    </OpportunityWorkspace>
  );
};
