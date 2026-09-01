'use client';

import { useMemo, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { EmptyState } from '@/components/hvac/EmptyState';
import { useO16Dashboard, useO16History, useO16Telemetry } from '@/hooks/useO16';
import { o16Error } from '@/lib/hvac/o16Format';
import type { O16Dashboard } from '@/lib/hvac/o16Types';
import { O16Header } from './O16Header';
import { OpportunityGridChrome } from '@/components/hvac/guide/OpportunityWorkspace';
import { HeadPressureKPIGrid } from './HeadPressureKPIGrid';
import { HeadPressureOptimizationCard } from './HeadPressureOptimizationCard';
import { CondenserPlantDiagram } from './CondenserPlantDiagram';
import { CondenserWaterControl } from './CondenserWaterControl';
import { HeadPressureTrendChart } from './HeadPressureTrendChart';
import { PressureEnergyOptimizationChart } from './PressureEnergyOptimizationChart';
import { HeatRejectionConditions } from './HeatRejectionConditions';
import { EngineeringRecommendation } from './EngineeringRecommendation';
import { SetpointReasonPanel } from './SetpointReasonPanel';
import { SafetyEnvelope } from './SafetyEnvelope';
import { EquipmentStatusTable } from './EquipmentStatusTable';
import { TelemetryQualityPanel } from './TelemetryQualityPanel';
import { SupervisoryDecision } from './SupervisoryDecision';

const EMPTY_O16: O16Dashboard = {
  opportunity_id: 'O16',
  live: false,
  ui_state: 'NO_DATA',
  bms_connected: false,
  current_state: {},
  optimized_state: {},
  classified_telemetry: { status: 'MISSING', quality: 'MISSING' },
  equipment: [],
  commands: [],
  header: {
    opportunity: 'O16',
    bms: 'OFFLINE',
    telemetry: 'MISSING',
    ui_state: 'NO_DATA',
    control_mode: 'ADVISORY',
    safe_mode: false,
  },
};

export function WaterCooledHeadPressureDashboard() {
  const dash = useO16Dashboard();
  const [hours, setHours] = useState(24);
  const hist = useO16History(hours, Boolean(dash.data));
  const tel = useO16Telemetry(Boolean(dash.data));
  const [selectedId, setSelectedId] = useState<string | 'all'>('all');
  const [actionErr, setActionErr] = useState<string | null>(null);
  const data = dash.data || EMPTY_O16;
  const equipment = useMemo(() => {
    const rows = data.equipment || [];
    if (selectedId === 'all') return rows;
    return rows.filter((r) => String(r.equipment_id || r.name) === selectedId);
  }, [data.equipment, selectedId]);
  const points = hist.data || [];
  const ui = (data.ui_state || data.header?.ui_state || '').toUpperCase();
  const awaiting = !dash.data && (dash.isPending || dash.isFetching);

  return (
    <div className="page-shell">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {awaiting ? (
          <div className="col-span-12 text-[11px] font-mono text-slate-500">Loading O16 telemetry…</div>
        ) : null}

        {actionErr && (
          <div className="col-span-12 kpi-tile" role="alert">
            <div className="text-sm font-semibold text-slate-900">Unable to complete O16 command</div>
            <p className="text-xs text-slate-600 mt-1">{actionErr}</p>
            <button type="button" className="mt-2 px-3 py-1.5 border border-slate-200 text-xs" onClick={() => setActionErr(null)}>
              Dismiss
            </button>
          </div>
        )}

        <OpportunityGridChrome
          opportunityId="O16"
          hero={
            <O16Header
              data={dash.data || null}
              equipment={data.equipment || []}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          }
        >
          {dash.isError && (
            <div className="col-span-12 kpi-tile space-y-3" role="alert">
              <div className="text-sm font-semibold text-slate-900">Unable to load O16 data</div>
              <p className="text-xs text-slate-600">{o16Error(dash.error instanceof ApiError ? dash.error : dash.error)}</p>
              <button type="button" className="btn-primary focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => dash.refetch()}>
                Retry
              </button>
            </div>
          )}
          {(ui === 'NO_DATA' || !dash.data) && (
            <div className="col-span-12">
              <EmptyState
                title="No telemetry available"
                detail="Canonical condenser-water points are missing. Values are not fabricated. Operations studio stays open."
              />
            </div>
          )}
          {ui === 'STALE' && (
            <div className="col-span-12 kpi-tile min-h-0 border-amber-500/30" role="status">
              <div className="text-[11px] font-semibold tracking-wider text-amber-800">STALE TELEMETRY</div>
              <div className="text-[11px] text-slate-600 mt-1">Optimization is held until a fresh production sample arrives.</div>
            </div>
          )}
          <HeadPressureKPIGrid data={data} history={points} />
          <div className="col-span-12 lg:col-span-7">
            <HeadPressureOptimizationCard data={data} />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <CondenserPlantDiagram data={data} equipment={data.equipment || []} />
          </div>
          <CondenserWaterControl data={data} />
          <HeatRejectionConditions data={data} />
          <HeadPressureTrendChart data={data} points={points} hours={hours} onHours={setHours} />
          {hist.isLoading ? (
            <div className="col-span-12 kpi-tile text-[11px] font-mono text-slate-500">
              Loading head-pressure energy chart…
            </div>
          ) : (
            <PressureEnergyOptimizationChart data={data} points={points} />
          )}
          <EngineeringRecommendation data={data} onError={setActionErr} />
          <SetpointReasonPanel data={data} />
          <SafetyEnvelope data={data} />
          <EquipmentStatusTable data={data} equipment={equipment} />
          <TelemetryQualityPanel data={data} points={tel.data?.points || []} />
          <SupervisoryDecision data={data} />
        </OpportunityGridChrome>
      </div>
    </div>
  );
}

export { WaterCooledHeadPressureDashboard as O16Dashboard };
