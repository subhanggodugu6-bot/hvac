'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/hvac/EmptyState';
import { PlanningActivityTimeline } from '../o17/PlanningActivityTimeline';
import { useO19Building, useO19Dashboard, useO19Opportunity } from '@/hooks/useO19';
import { o19ErrorMessage, o19EquipmentRows, o19SecondsAgo, o19TelemetryBadge } from '@/lib/hvac/o19Format';
import { EquipmentMaintenanceHeader } from './EquipmentMaintenanceHeader';
import { OpportunityGridChrome } from '@/components/hvac/guide/OpportunityWorkspace';
import { EquipmentMaintenanceKPIGrid } from './EquipmentMaintenanceKPIGrid';
import { EquipmentHealthGrid } from './EquipmentHealthGrid';
import { MaintenancePriorityPanel } from './MaintenancePriorityPanel';
import { DiagnosticIndicatorsTable } from './DiagnosticIndicatorsTable';
import { EquipmentDetailPanel } from './EquipmentDetailPanel';
import { MaintenanceRecommendation } from './MaintenanceRecommendation';
import { MaintenanceWorkOrderTable } from './MaintenanceWorkOrderTable';
import { MaintenanceEngineeringTable } from './MaintenanceEngineeringTable';
import { MaintenanceTrendChart } from './MaintenanceTrendChart';
import { MaintenanceDecisionPanel } from './MaintenanceDecisionPanel';
import { EquipmentDataQuality } from './EquipmentDataQuality';

export function EquipmentMaintenanceDashboard() {
  const opp = useO19Opportunity();
  const dash = useO19Dashboard();
  const building = useO19Building();
  const data = opp.data ?? { id: 'O19' };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId || (o19EquipmentRows(data)?.[0]?.id ?? null);

  return (
    <div className="page-shell">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {opp.isFetching && !opp.data ? (
          <div className="col-span-12 text-[11px] font-mono text-slate-500">Loading O19 telemetry…</div>
        ) : null}

        {opp.isError ? (
          <div className="col-span-12 kpi-tile space-y-3" role="alert">
            <div className="text-sm font-semibold text-slate-900">Unable to load O19 energy efficiency maintenance</div>
            <p className="text-xs text-slate-600">{o19ErrorMessage(opp.error instanceof ApiError ? opp.error : opp.error)}</p>
            <button type="button" className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => opp.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        <OpportunityGridChrome
            opportunityId="O19"
            hero={<EquipmentMaintenanceHeader data={data} dash={dash.data} buildingName={building.data?.buildingName ?? null} platform={building.data} />}
          >
            {['NO DATA', 'MISSING', 'BMS OFFLINE'].includes(o19TelemetryBadge(data)) ? (
              <div className="col-span-12">
                <EmptyState title="NO DATA AVAILABLE" detail="O19 maintenance evidence is missing. Findings are not fabricated." />
              </div>
            ) : null}
            <EquipmentMaintenanceKPIGrid data={data} />
            <div className="col-span-12 xl:col-span-8">
              <EquipmentHealthGrid data={data} selectedId={selected} onSelect={setSelectedId} />
            </div>
            <div className="col-span-12 xl:col-span-4">
              <MaintenancePriorityPanel data={data} onSelect={setSelectedId} />
            </div>
            <DiagnosticIndicatorsTable data={data} />
            <div className="col-span-12 xl:col-span-8">
              <EquipmentDetailPanel data={data} selectedId={selected} />
            </div>
            <div className="col-span-12 xl:col-span-4">
              <MaintenanceDecisionPanel data={data} />
            </div>
            <MaintenanceRecommendation data={data} />
            <MaintenanceWorkOrderTable data={data} onView={(id) => id && setSelectedId(id)} />
            <MaintenanceTrendChart data={data} />
            <MaintenanceEngineeringTable data={data} onSelect={setSelectedId} />
            <div className="col-span-12 xl:col-span-6">
              <EquipmentDataQuality data={data} dash={dash.data} />
            </div>
            <div className="col-span-12 xl:col-span-6">
              <PlanningActivityTimeline data={data} />
            </div>
            <footer className="col-span-12 text-[10px] font-mono text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>O19 Energy Efficiency Maintenance</span>
              <span>Telemetry {o19TelemetryBadge(data)}</span>
              <span>Evaluated {o19SecondsAgo(data.timestamp || data.telemetry?.lastUpdated)}</span>
            </footer>
          </OpportunityGridChrome>
      </div>
    </div>
  );
}
