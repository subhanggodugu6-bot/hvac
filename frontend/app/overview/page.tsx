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

function EnergySparkline({ points, unit }: { points: { t?: string; v?: number }[]; unit?: string }) {
  if (!points.length) {
    return <p className="text-[12px] text-slate-500 mt-4">AWAITING TELEMETRY — no energy series yet.</p>;
  }
  const vals = points.map((p) => Number(p.v)).filter((n) => Number.isFinite(n));
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = Math.max(max - min, 1);
  const w = 320;
  const h = 120;
  const path = vals
    .map((v, i) => {
      const x = (i / Math.max(vals.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = vals[vals.length - 1];

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-[1.35rem] font-bold text-slate-900 tabular-nums">
          {last.toFixed(1)} <span className="text-[12px] font-semibold text-slate-600">{unit || 'kW'}</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{vals.length} pts</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px]" preserveAspectRatio="none" role="img" aria-label="Energy series">
        <path d={path} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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

      <KpiRow
        items={[
          {
            label: 'Plant / HVAC load',
            value: kpis.coolingTons != null ? `${Number(kpis.coolingTons).toFixed(1)} Tons` : null,
            detail: tel === 'SIMULATED' ? 'DATASET — not LIVE BMS' : 'From supervisory plant telemetry',
            icon: Server,
          },
          {
            label: 'Comfort',
            value: kpis.comfortPct != null ? `${Number(kpis.comfortPct).toFixed(1)}%` : null,
            detail: 'Measured comfort envelope',
            icon: ShieldCheck,
          },
          {
            label: 'Verified kW',
            value: kpis.verifiedKw != null ? `+${Number(kpis.verifiedKw).toFixed(1)} kW` : null,
            detail: 'Supervisory M&V only — not GUIDE_POTENTIAL',
            icon: Zap,
          },
          {
            label: 'Active alerts',
            value: kpis.alertCount != null ? String(kpis.alertCount) : null,
            detail: 'Stale / BAD / BMS / O19',
            icon: Activity,
          },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 space-y-4">
          {home.isLoading && plantEmpty ? (
            <div className="card-static p-8 text-[13px] text-slate-500">Loading plant canvas from simulated telemetry…</div>
          ) : plantEmpty ? (
            <AssetRailEmpty />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <PlantCanvas layers={layers} selectedId={active?.equipment_id} onSelect={setSelected} />
              </div>
              <div className="lg:col-span-5">
                <AssetRail selected={active} opportunities={allOpps} telStatus={tel} />
              </div>
            </div>
          )}
          <section className="card-static p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold text-slate-800">Energy</div>
              <span className="text-[10px] font-mono text-slate-600">GUIDE_POTENTIAL is not plotted here</span>
            </div>
            <EnergySparkline points={energy} unit={data?.energy?.unit} />
          </section>
        </div>
        <div className="xl:col-span-4">
          <AlertRail alerts={data?.alerts} />
        </div>
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
