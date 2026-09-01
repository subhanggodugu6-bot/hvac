'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, LayoutDashboard, Server, ShieldCheck, Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import { TableEmptyState } from '@/components/hvac/TableEmptyState';
import { AlertRail, AssetRail, AssetRailEmpty, KpiRow, PlantCanvas, SystemsHub } from '@/components/hvac/bms-home';
import { hvacFetch } from '@/lib/api/client';
import { PLATFORM_POLL_MS } from '@/lib/hvac/poll';
import { getOpportunity } from '@/lib/hvac/opportunityConfig';
import { DEFAULT_FACILITY_CONFIG } from '@/lib/facilityConfig';
import {
  mergeDashboardChapters,
  type DashboardHome,
  type DashboardOpportunity,
  type PlantEquipment,
} from '@/lib/hvac/dashboardHome';

function EnergyChart({ points, unit }: { points: { t?: string; v?: number }[]; unit?: string }) {
  if (!points.length) {
    return <p className="text-[12px] text-slate-500 mt-4">AWAITING TELEMETRY — no energy series yet.</p>;
  }
  const vals = points.map((p) => Number(p.v)).filter((n) => Number.isFinite(n));
  if (!vals.length) {
    return <p className="text-[12px] text-slate-500 mt-4">AWAITING TELEMETRY — no energy series yet.</p>;
  }
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = Math.max(max - min, max * 0.08, 1);
  const w = 480;
  const h = 100;
  const pad = 4;
  const barGap = 2;
  const barW = Math.max(4, (w - pad * 2 - barGap * (vals.length - 1)) / vals.length);
  const last = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  const areaPath = vals
    .map((v, i) => {
      const x = pad + i * (barW + barGap) + barW / 2;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const baseline = h - pad;
  const firstX = pad + barW / 2;
  const lastX = pad + (vals.length - 1) * (barW + barGap) + barW / 2;
  const fillPath = `${areaPath} L${lastX.toFixed(1)},${baseline} L${firstX.toFixed(1)},${baseline} Z`;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-[1.35rem] font-bold text-slate-900 tabular-nums">
            {last.toFixed(1)} <span className="text-[12px] font-semibold text-slate-600">{unit || 'kW'}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            avg {avg.toFixed(1)} {unit || 'kW'} · {vals.length} samples
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-violet-200" /> bar
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-0.5 bg-violet-500 rounded" /> trend
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[100px]" preserveAspectRatio="none" role="img" aria-label="Energy trend">
        <defs>
          <linearGradient id="energy-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#energy-fill)" />
        {vals.map((v, i) => {
          const barH = Math.max(2, ((v - min) / span) * (h - pad * 2));
          const x = pad + i * (barW + barGap);
          const y = h - pad - barH;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={Math.min(2, barW / 2)}
              fill="#c4b5fd"
              opacity={0.85}
            />
          );
        })}
        <path d={areaPath} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function FleetOverviewPage() {
  const home = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: async () => {
      const res = await hvacFetch('/api/platform/dashboard/home');
      if (!res.ok) throw new Error('DATA SOURCE ERROR');
      return res.json() as Promise<DashboardHome>;
    },
    refetchInterval: PLATFORM_POLL_MS,
    retry: 3,
    retryDelay: 4000,
    staleTime: 15_000,
  });
  const data = home.data;
  const layers = data?.layers;
  const chapters = useMemo(() => mergeDashboardChapters(data?.chapters), [data?.chapters]);
  const allOpps: DashboardOpportunity[] = useMemo(
    () => chapters.flatMap((c) => c.opportunities),
    [chapters],
  );
  const firstRow = useMemo(() => {
    for (const rows of Object.values(layers || {})) {
      if (rows?.[0]) return rows[0];
    }
    return null;
  }, [layers]);
  const [selected, setSelected] = useState<PlantEquipment | null>(null);
  const active = selected || firstRow;
  const plantEmpty = !layers || Object.values(layers).every((rows) => !rows?.length);
  const tel = String(data?.telemetry?.status || data?.provenance || 'NO DATA');
  const kpis = data?.kpis || {};
  const energy = data?.energy?.points || [];

  const derivedKpis = useMemo(() => {
    let coolingTons = kpis.coolingTons;
    let verifiedKw = kpis.verifiedKw;
    if (coolingTons == null && layers) {
      const loads: number[] = [];
      for (const row of layers.chillers || []) {
        for (const [name, p] of Object.entries(row.points || {})) {
          const key = name.toLowerCase();
          if (key !== 'load' && !key.includes('load')) continue;
          const val = Number(p.value);
          const unit = String(p.unit || '').toLowerCase();
          if (Number.isFinite(val) && (unit.includes('ton') || unit === 't' || unit === '')) loads.push(val);
        }
      }
      if (loads.length) coolingTons = Math.max(...loads);
    }
    if (verifiedKw == null && layers) {
      let total = 0;
      let found = false;
      for (const row of layers.chillers || []) {
        const p = row.points?.power;
        const val = Number(p?.value);
        if (Number.isFinite(val)) {
          total += val;
          found = true;
        }
      }
      if (found) verifiedKw = total;
    }
    return { coolingTons, verifiedKw, comfortPct: kpis.comfortPct, alertCount: kpis.alertCount };
  }, [kpis, layers]);

  return (
    <div className="page-shell">
      <PageHeader
        icon={LayoutDashboard}
        title="Building operations"
        subtitle={`${data?.building?.name || DEFAULT_FACILITY_CONFIG.name} · Plant canvas, energy, and the full O1–O20 register. Module pipeline and cards live on Systems Intelligence.`}
        badge={tel}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={toneForStatus(data?.bms?.status)} pulse={false}>
              BMS {data?.bms?.status || 'DISCONNECTED'}
            </StatusBadge>
            <StatusBadge tone={toneForStatus(tel)} pulse={tel === 'LIVE'}>
              TEL {tel}
            </StatusBadge>
          </div>
        }
      />

      {home.isLoading && !data ? (
        <EmptyState
          title="LOADING PLANT DATA"
          detail="Waking the API (free Render can take up to a minute). Keep this tab open."
          onRetry={() => void home.refetch()}
        />
      ) : null}

      {home.isError && !data ? (
        <EmptyState
          title="DATA SOURCE ERROR"
          detail="Dashboard home could not be loaded. Check Gateway connectivity and retry."
          href="/platform/bms"
          actionLabel="Open Gateway"
          onRetry={() => void home.refetch()}
        />
      ) : null}

      <AlertRail alerts={data?.alerts} compact />

      <KpiRow
        items={[
          {
            label: 'Plant / HVAC load',
            value: derivedKpis.coolingTons != null ? `${Number(derivedKpis.coolingTons).toFixed(1)} Tons` : null,
            detail: tel === 'SIMULATED' ? 'DATASET — not LIVE BMS' : 'From supervisory plant telemetry',
            icon: Server,
          },
          {
            label: 'Comfort',
            value: derivedKpis.comfortPct != null ? `${Number(derivedKpis.comfortPct).toFixed(1)}%` : null,
            detail: 'Measured comfort envelope',
            icon: ShieldCheck,
          },
          {
            label: 'Verified kW',
            value: derivedKpis.verifiedKw != null ? `${Number(derivedKpis.verifiedKw).toFixed(1)} kW` : null,
            detail: 'Supervisory M&V only — not GUIDE_POTENTIAL',
            icon: Zap,
          },
          {
            label: 'Active alerts',
            value: derivedKpis.alertCount != null ? String(derivedKpis.alertCount) : null,
            detail: 'Stale / BAD / BMS / O19',
            icon: Activity,
          },
        ]}
      />

      <div className="space-y-4">
        {home.isLoading && plantEmpty ? (
          <div className="card-static p-8 text-[13px] text-slate-500">Loading plant canvas from simulated telemetry…</div>
        ) : plantEmpty ? (
          <AssetRailEmpty />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[220px]">
            <PlantCanvas layers={layers} selectedId={active?.equipment_id} onSelect={setSelected} />
            <AssetRail selected={active} opportunities={allOpps} telStatus={tel} />
          </div>
        )}
        <section className="card-static p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-slate-800">Energy</div>
            <span className="text-[10px] font-mono text-slate-600">Measured plant power — not GUIDE_POTENTIAL</span>
          </div>
          <EnergyChart points={energy} unit={data?.energy?.unit} />
        </section>
      </div>

      <div>
        <div className="section-heading-label mb-3">Guide chapters</div>
        <SystemsHub chapters={chapters} variant="compact" />
        <p className="text-[10px] font-mono text-slate-500 mt-2">GUIDE_POTENTIAL · non-cumulative · not measured LIVE</p>
      </div>

      <section className="card-static overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between gap-2 border-b border-slate-100">
          <div className="text-[13px] font-semibold text-slate-800">Opportunities O1–O20</div>
          <span className="text-[11px] text-slate-600">{allOpps.length} modules</span>
        </div>
        <div className="overflow-x-auto eng-scroll">
          <table className="bms-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Table 1</th>
                <th>Telemetry</th>
                <th>Guide %</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {allOpps.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  title="NO OPPORTUNITIES"
                  detail="Connect plant data via Gateway or retry dashboard home."
                  onRetry={() => void home.refetch()}
                />
              ) : (
                allOpps.map((o) => {
                  const def = getOpportunity(o.id);
                  return (
                    <tr key={o.id}>
                      <td className="font-mono font-semibold text-violet-700">{o.id}</td>
                      <td className="text-slate-800">{def?.title || o.title || o.id}</td>
                      <td>
                        <StatusBadge tone="neutral" pulse={false}>
                          {o.applicability || 'Unmapped'}
                        </StatusBadge>
                      </td>
                      <td>
                        <StatusBadge tone={toneForStatus(o.telemetry)} pulse={o.telemetry === 'LIVE'}>
                          {o.telemetry || 'NO DATA'}
                        </StatusBadge>
                      </td>
                      <td className="font-mono text-[11px] text-slate-500">{o.guide_savings_potential || 'GUIDE_POTENTIAL'}</td>
                      <td>
                        <Link href={o.href || def?.route || '/agents'} className="text-violet-600 font-semibold text-[12px] hover:text-violet-800">
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
