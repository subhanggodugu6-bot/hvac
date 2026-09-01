'use client';

import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/hvac/EmptyState';
import { useO10Audit, useO10Dashboard, useO10Opportunity, useO10Platform } from '@/hooks/useO10';
import { O10Header } from './O10Header';
import { OpportunityGridChrome } from '@/components/hvac/guide/OpportunityWorkspace';
import { O10StatusStrip } from './O10StatusStrip';
import { O10KpiGrid } from './O10KpiGrid';
import { O10Eligibility } from './O10Eligibility';
import { O10CurrentRecommended } from './O10CurrentRecommended';
import { O10AhuDiagram } from './O10AhuDiagram';
import { O10AirCondition } from './O10AirCondition';
import { O10Recommendation } from './O10Recommendation';
import { O10SafetyActions } from './O10SafetyActions';
import {
  O10Audit,
  O10ControlParams,
  O10DataQuality,
  O10Diagnostics,
  O10Energy,
  O10Equipment,
  O10GuideReference,
  O10Historian,
  O10Iaq,
  O10Lockouts,
  O10Modes,
} from './O10Panels';
import type { VentilationOpportunity } from '@/lib/hvac/ventilationTypes';

const EMPTY_O10: VentilationOpportunity = { id: 'O10', opportunityId: 'O10' };

export function O10Dashboard() {
  const opp = useO10Opportunity();
  const dash = useO10Dashboard();
  const platform = useO10Platform();
  const audit = useO10Audit();
  const data = opp.data ?? EMPTY_O10;
  const sourceError = opp.isError;

  return (
    <div className="space-y-6 pb-12">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {opp.isFetching && !opp.data ? (
          <div className="col-span-12 text-[11px] font-mono text-slate-500" aria-busy="true">
            Loading O10 telemetry…
          </div>
        ) : null}

        {sourceError ? (
          <div className="col-span-12 kpi-tile space-y-3" role="alert">
            <EmptyState title="DATA SOURCE ERROR" detail="Unable to retrieve O10 telemetry from the HVAC service." />
            <button type="button" className="btn-primary" onClick={() => opp.refetch()}>
              Retry
            </button>
            {opp.error instanceof ApiError ? <p className="text-[11px] text-rose-800">{opp.error.message}</p> : null}
          </div>
        ) : null}

        <OpportunityGridChrome
          opportunityId="O10"
          hero={<O10Header data={data} dash={dash.data} platform={platform.data} />}
        >
          <O10StatusStrip data={data} platform={platform.data} />
          <O10KpiGrid data={data} />
          <O10Eligibility data={data} platform={platform.data} />
          <O10CurrentRecommended data={data} />
          <O10AhuDiagram data={data} />
          <O10Modes data={data} />
          <O10AirCondition data={data} />
          <O10Recommendation data={data} />
          <O10SafetyActions data={data} platform={platform.data} />
          <O10ControlParams data={data} />
          <O10Lockouts data={data} safeMode={platform.data?.safeMode} />
          <O10Energy data={data} />
          <O10Iaq data={data} />
          <O10Equipment />
          <O10Diagnostics />
          <O10Historian />
          <O10Audit events={((audit.data?.events || []) as Array<Record<string, unknown>>)} />
          <O10DataQuality data={data} />
          <O10GuideReference />
          <footer className="col-span-12 text-[10px] font-mono text-slate-600">
            O10 Economy Cycle · evaluate_dispatch remains the write gate · guide values are reference only
          </footer>
        </OpportunityGridChrome>
      </div>
    </div>
  );
}
