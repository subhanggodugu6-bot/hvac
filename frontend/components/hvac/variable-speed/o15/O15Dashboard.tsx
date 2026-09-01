'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/hvac/EmptyState';
import { useO15Dashboard, useO15History } from '@/hooks/useO15';
import { operatorErrorMessage } from '@/lib/hvac/o15Format';
import type { O15Dashboard as O15DashboardData } from '@/lib/hvac/o15Types';
import { O15Header, O15StatusStrip } from './O15Header';
import { OpportunityGridChrome } from '@/components/hvac/guide/OpportunityWorkspace';
import { O15KpiGrid } from './O15KpiGrid';
import { O15RecommendationCard } from './O15RecommendationCard';
import { O15HeadPressureChart } from './O15HeadPressureChart';
import { O15PressureRelationshipChart } from './O15PressureRelationshipChart';
import { O15FanPerformance } from './O15FanPerformance';
import { O15OperatingState } from './O15OperatingState';
import { O15SafetyPanel } from './O15SafetyPanel';
import { O15DataQuality } from './O15DataQuality';
import { O15EngineeringLimits } from './O15EngineeringLimits';
import { O15DecisionPanel } from './O15DecisionPanel';
import { O15CommandHistory } from './O15CommandHistory';
import { O15RollbackStatus, O15VerificationCard } from './O15VerificationCard';
import { O15SectionSkeleton } from './O15Skeleton';

const EMPTY_O15: O15DashboardData = {
  opportunity_id: 'O15',
  live: false,
  ui_state: 'NO_DATA',
  bms_connected: false,
  bms_status: 'OFFLINE',
  current_state: {},
  optimized_state: {},
  classified_telemetry: { status: 'MISSING', quality: 'MISSING' },
  condensers: [],
  fans: [],
  commands: [],
  header: {
    opportunity: 'O15',
    bms: 'OFFLINE',
    telemetry: 'MISSING',
    ui_state: 'NO_DATA',
    control_mode: 'ADVISORY',
  },
};

export function O15Dashboard() {
  const dash = useO15Dashboard();
  const [hours, setHours] = useState(24);
  const hist = useO15History(hours, Boolean(dash.data));
  const [actionErr, setActionErr] = useState<string | null>(null);
  const data = dash.data || EMPTY_O15;
  const ui = (data.ui_state || data.header?.ui_state || '').toUpperCase();
  const points = hist.data || [];
  const latestCmd = data.commands?.[0] || data.command;
  const awaiting = !dash.data && (dash.isPending || dash.isFetching);

  return (
    <div className="space-y-6 pb-12">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {awaiting ? (
          <div className="col-span-12 text-[11px] font-mono text-slate-500">Loading O15 telemetry…</div>
        ) : null}

        {actionErr && (
          <div className="col-span-12 kpi-tile" role="alert">
            <div className="text-sm font-semibold text-slate-900">Unable to complete O15 command</div>
            <p className="text-xs text-slate-400 mt-1">{actionErr}</p>
            <button type="button" className="mt-2 px-3 py-1.5 border border-slate-200 text-xs" onClick={() => setActionErr(null)}>
              Dismiss
            </button>
          </div>
        )}

        <OpportunityGridChrome opportunityId="O15" hero={<O15Header data={dash.data || null} />}>
          {dash.isError && (
            <div className="col-span-12 kpi-tile space-y-3" role="alert">
              <div className="text-sm font-semibold text-slate-900">Unable to load O15 data</div>
              <p className="text-xs text-slate-400">{operatorErrorMessage(dash.error instanceof ApiError ? dash.error : dash.error)}</p>
              <button type="button" className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => dash.refetch()}>
                Retry
              </button>
            </div>
          )}
          <O15StatusStrip data={data} />
          {(ui === 'NO_DATA' || !dash.data) && (
            <div className="col-span-12">
              <EmptyState
                title="No telemetry available"
                detail="Canonical air-cooled condenser points are missing. Values are not fabricated. Operations studio stays open."
              />
            </div>
          )}
          <O15KpiGrid data={data} history={points} />
          <div className="col-span-12 xl:col-span-8">
            <O15RecommendationCard data={data} onError={setActionErr} />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <O15DecisionPanel data={data} />
          </div>
          <div className="col-span-12">
            {hist.isLoading ? (
              <O15SectionSkeleton title="Head Pressure Trend" rows={8} />
            ) : (
              <O15HeadPressureChart
                points={points}
                hours={hours}
                onHours={setHours}
                recommendedTarget={data.optimized_state?.recommended_head_pressure}
              />
            )}
          </div>
          <div className="col-span-12 xl:col-span-6">
            {hist.isLoading ? (
              <O15SectionSkeleton title="Outdoor Air vs Head Pressure" rows={6} />
            ) : (
              <O15PressureRelationshipChart data={data} points={points} />
            )}
          </div>
          <div className="col-span-12 xl:col-span-6">
            {hist.isLoading ? (
              <O15SectionSkeleton title="Condenser Fan Performance" rows={6} />
            ) : (
              <O15FanPerformance data={data} points={points} />
            )}
          </div>
          <O15OperatingState data={data} />
          <div className="col-span-12 lg:col-span-6">
            <O15SafetyPanel data={data} />
          </div>
          <div className="col-span-12 lg:col-span-6 space-y-3">
            <O15DataQuality data={data} />
            <O15EngineeringLimits data={data} />
            <O15VerificationCard command={latestCmd} />
            <O15RollbackStatus command={latestCmd} />
          </div>
          <O15CommandHistory commands={data.commands || []} />
        </OpportunityGridChrome>
      </div>
    </div>
  );
}
