'use client';

import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/hvac/EmptyState';
import { PlanningActivityTimeline } from '../o17/PlanningActivityTimeline';
import { useO20Building, useO20Dashboard, useO20Opportunity } from '@/hooks/useO20';
import { o20ErrorMessage, o20SecondsAgo, o20TelemetryBadge } from '@/lib/hvac/o20Format';
import { ControlSoftwareHeader } from './ControlSoftwareHeader';
import { OpportunityGridChrome } from '@/components/hvac/guide/OpportunityWorkspace';
import { ControlSoftwareKPIGrid } from './ControlSoftwareKPIGrid';
import { ControlHealthOverview } from './ControlHealthOverview';
import { ControlPointTable } from './ControlPointTable';
import { OverridePanel } from './OverridePanel';
import { ControlDriftPanel } from './ControlDriftPanel';
import { StaleFailedPoints } from './StaleFailedPoints';
import { ControlRecommendation } from './ControlRecommendation';
import { ControlChangeHistory } from './ControlChangeHistory';
import { ControlDecisionPanel } from './ControlDecisionPanel';
import { ControlHealthCharts } from './ControlHealthCharts';
import { ControlDataQuality } from './ControlDataQuality';

export function ControlSoftwareDashboard() {
  const opp = useO20Opportunity();
  const dash = useO20Dashboard();
  const building = useO20Building();
  const data = opp.data ?? { id: 'O20' };

  return (
    <div className="page-shell">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {opp.isFetching && !opp.data ? (
          <div className="col-span-12 text-[11px] font-mono text-slate-500">Loading O20 telemetry…</div>
        ) : null}

        {opp.isError ? (
          <div className="col-span-12 kpi-tile space-y-3" role="alert">
            <div className="text-sm font-semibold text-slate-900">Unable to load O20 control software</div>
            <p className="text-xs text-slate-600">{o20ErrorMessage(opp.error instanceof ApiError ? opp.error : opp.error)}</p>
            <button type="button" className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => opp.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        <OpportunityGridChrome
            opportunityId="O20"
            hero={<ControlSoftwareHeader data={data} dash={dash.data} buildingName={building.data?.buildingName ?? null} platform={building.data} />}
          >
            {['NO DATA', 'MISSING', 'BMS OFFLINE'].includes(o20TelemetryBadge(data)) ? (
              <div className="col-span-12">
                <EmptyState title="NO DATA AVAILABLE" detail="Controller software records are missing. Point lists and health percentages are not fabricated." />
              </div>
            ) : null}
            <ControlSoftwareKPIGrid data={data} />
            <div className="col-span-12 xl:col-span-8">
              <ControlRecommendation data={data} />
            </div>
            <div className="col-span-12 xl:col-span-4">
              <ControlDecisionPanel data={data} />
            </div>
            <div className="col-span-12 xl:col-span-5">
              <ControlHealthOverview data={data} />
            </div>
            <div className="col-span-12 xl:col-span-7">
              <ControlDriftPanel data={data} />
            </div>
            <div className="col-span-12 xl:col-span-6">
              <OverridePanel data={data} />
            </div>
            <div className="col-span-12 xl:col-span-6">
              <StaleFailedPoints data={data} />
            </div>
            <ControlPointTable data={data} />
            <ControlChangeHistory data={data} dash={dash.data} platform={building.data} />
            <ControlHealthCharts data={data} />
            <div className="col-span-12 xl:col-span-6">
              <ControlDataQuality data={data} dash={dash.data} />
            </div>
            <div className="col-span-12 xl:col-span-6">
              <PlanningActivityTimeline data={data} />
            </div>
            <footer className="col-span-12 text-[10px] font-mono text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>O20 Management of System Control Software</span>
              <span>Telemetry {o20TelemetryBadge(data)}</span>
              <span>Evaluated {o20SecondsAgo(data.timestamp || data.telemetry?.lastUpdated)}</span>
            </footer>
          </OpportunityGridChrome>
      </div>
    </div>
  );
}
