'use client';

import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/hvac/EmptyState';
import { useO18Building, useO18Dashboard, useO18Opportunity } from '@/hooks/useO18';
import { o18ErrorMessage, o18SecondsAgo, o18TelemetryBadge } from '@/lib/hvac/o18Format';
import { TrainingAwarenessHeader } from './TrainingAwarenessHeader';
import { OpportunityGridChrome } from '@/components/hvac/guide/OpportunityWorkspace';
import { TrainingKPIGrid } from './TrainingKPIGrid';
import { TrainingProgress } from './TrainingProgress';
import { TrainingTable } from './TrainingTable';
import { TrainingRecommendationCard } from './TrainingRecommendationCard';
import { AffectedUsersTable } from './AffectedUsersTable';
import { EnergyAwarenessChart } from './EnergyAwarenessChart';
import { TrainingDecisionPanel } from './TrainingDecisionPanel';
import { TrainingDataQuality } from './TrainingDataQuality';
import { TrainingEvidence } from './TrainingEvidence';
import { PlanningActivityTimeline } from '../o17/PlanningActivityTimeline';

export function TrainingAwarenessDashboard() {
  const opp = useO18Opportunity();
  const dash = useO18Dashboard();
  const building = useO18Building();
  const data = opp.data ?? { id: 'O18' };
  const dashData = dash.data;

  return (
    <div className="space-y-6 pb-12">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {opp.isFetching && !opp.data ? (
          <div className="col-span-12 text-[11px] font-mono text-slate-500">Loading O18 telemetry…</div>
        ) : null}

        {opp.isError ? (
          <div className="col-span-12 kpi-tile space-y-3" role="alert">
            <div className="text-sm font-semibold text-slate-900">Unable to load O18 training and awareness</div>
            <p className="text-xs text-slate-400">{o18ErrorMessage(opp.error instanceof ApiError ? opp.error : opp.error)}</p>
            <button type="button" className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => opp.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        <OpportunityGridChrome
            opportunityId="O18"
            hero={<TrainingAwarenessHeader data={data} dash={dashData} buildingName={building.data?.buildingName ?? null} platform={building.data} />}
          >
            {['NO DATA', 'MISSING', 'BMS OFFLINE'].includes(o18TelemetryBadge(data)) ? (
              <div className="col-span-12">
                <EmptyState title="NO DATA AVAILABLE" detail="O18 training records are missing. Completion is not fabricated." />
              </div>
            ) : null}
            <TrainingKPIGrid data={data} />
            <TrainingProgress data={data} />
            <div className="col-span-12 xl:col-span-8">
              <TrainingRecommendationCard data={data} />
            </div>
            <div className="col-span-12 xl:col-span-4">
              <TrainingDecisionPanel data={data} />
            </div>
            <div className="col-span-12 xl:col-span-6">
              <AffectedUsersTable data={data} />
            </div>
            <div className="col-span-12 xl:col-span-6">
              <TrainingEvidence data={data} />
            </div>
            <EnergyAwarenessChart data={data} dash={dashData} />
            <TrainingTable data={data} />
            <div className="col-span-12 xl:col-span-6">
              <TrainingDataQuality data={data} dash={dashData} />
            </div>
            <div className="col-span-12 xl:col-span-6">
              <PlanningActivityTimeline data={data} />
            </div>
            <footer className="col-span-12 text-[10px] font-mono text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>O18 Energy Management Training &amp; Awareness</span>
              <span>Telemetry {o18TelemetryBadge(data)}</span>
              <span>Evaluated {o18SecondsAgo(data.timestamp || data.telemetry?.lastUpdated)}</span>
              <span>Source {data.source || data.telemetry?.source || '—'}</span>
            </footer>
          </OpportunityGridChrome>
      </div>
    </div>
  );
}
