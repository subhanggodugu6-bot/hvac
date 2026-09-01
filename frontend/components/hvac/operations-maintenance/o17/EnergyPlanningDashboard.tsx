'use client';

import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/hvac/EmptyState';
import { useO17Building, useO17Dashboard, useO17Opportunity } from '@/hooks/useO17';
import { o17ErrorMessage, o17SecondsAgo, o17TelemetryBadge } from '@/lib/hvac/o17Format';
import { EnergyPlanningHeader } from './EnergyPlanningHeader';
import { OpportunityGridChrome } from '@/components/hvac/guide/OpportunityWorkspace';
import { EnergyPlanningKPIGrid } from './EnergyPlanningKPIGrid';
import { EnergyPlanningChart } from './EnergyPlanningChart';
import { PlanningRecommendationCard } from './PlanningRecommendationCard';
import { PlanningTable } from './PlanningTable';
import { PlanningDecisionPanel } from './PlanningDecisionPanel';
import { PlanningEngineeringDetails } from './PlanningEngineeringDetails';
import { PlanningDataQuality } from './PlanningDataQuality';
import { PlanningActivityTimeline } from './PlanningActivityTimeline';

export function EnergyPlanningDashboard() {
  const opp = useO17Opportunity();
  const dash = useO17Dashboard();
  const building = useO17Building();
  const data = opp.data ?? { id: 'O17' };
  const dashData = dash.data;

  return (
    <div className="page-shell">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {opp.isFetching && !opp.data ? (
          <div className="col-span-12 text-[11px] font-mono text-slate-500">Loading O17 telemetry…</div>
        ) : null}

        {opp.isError ? (
          <div className="col-span-12 kpi-tile space-y-3" role="alert">
            <div className="text-sm font-semibold text-slate-900">Unable to load O17 energy planning</div>
            <p className="text-xs text-slate-600">{o17ErrorMessage(opp.error instanceof ApiError ? opp.error : opp.error)}</p>
            <button type="button" className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => opp.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        <OpportunityGridChrome
            opportunityId="O17"
            hero={<EnergyPlanningHeader data={data} dash={dashData} buildingName={building.data?.buildingName ?? null} platform={building.data} />}
          >
            {['NO DATA', 'MISSING', 'BMS OFFLINE'].includes(o17TelemetryBadge(data)) ? (
              <div className="col-span-12">
                <EmptyState title="NO DATA AVAILABLE" detail="O17 telemetry is missing. Planning values are not fabricated." />
              </div>
            ) : null}
            <EnergyPlanningKPIGrid data={data} dash={dashData} />
            <EnergyPlanningChart data={data} dash={dashData} />
            <div className="col-span-12 xl:col-span-8">
              <PlanningRecommendationCard data={data} />
            </div>
            <div className="col-span-12 xl:col-span-4">
              <PlanningDecisionPanel data={data} />
            </div>
            <PlanningTable data={data} dash={dashData} />
            <PlanningEngineeringDetails data={data} dash={dashData} />
            <div className="col-span-12 xl:col-span-6">
              <PlanningDataQuality data={data} dash={dashData} />
            </div>
            <div className="col-span-12 xl:col-span-6 kpi-tile">
              <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Safety / dispatch</h2>
              <p className="text-[12px] text-slate-600">
                Safety {data.safety?.status || '—'} · Dispatch {data.dispatch?.status || '—'} · Rollback{' '}
                {data.dispatch?.rollbackAvailable ? 'AVAILABLE' : '—'}
              </p>
            </div>
            <PlanningActivityTimeline data={data} />
            <footer className="col-span-12 text-[10px] font-mono text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>O17 Energy Management Planning</span>
              <span>Telemetry {o17TelemetryBadge(data)}</span>
              <span>Evaluated {o17SecondsAgo(data.timestamp || data.telemetry?.lastUpdated)}</span>
              <span>Source {data.source || data.telemetry?.source || '—'}</span>
            </footer>
          </OpportunityGridChrome>
      </div>
    </div>
  );
}
