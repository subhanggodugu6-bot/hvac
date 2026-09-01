'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LIVE_POLL_MS } from '@/lib/hvac/poll';
import { fetchHistory, fetchSchedulingDashboard, fetchStatus } from '@/lib/api';
import { useSupervisoryStore } from '@/lib/store';
import { TopKPIs } from '@/components/scheduling/TopKPIs';
import { OpportunityCard } from '@/components/scheduling/OpportunityCard';
import { TemperatureChart } from '@/components/scheduling/TemperatureChart';
import { SafetyValidationPanel } from '@/components/scheduling/SafetyValidationPanel';
import { AgentDecisionPanel } from '@/components/scheduling/AgentDecisionPanel';
import { LiveControlLog } from '@/components/scheduling/LiveControlLog';
import { ModelStatusPanel } from '@/components/scheduling/ModelStatusPanel';
import { MlSectionStrip } from '@/components/hvac/MlSectionStrip';
import { EngineeringLimitsModal } from '@/components/scheduling/EngineeringLimitsModal';
import { Cpu } from 'lucide-react';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChapterChrome } from '@/components/hvac/bms-home';

export default function SchedulingAgentPage() {
  const dash = useQuery({
    queryKey: ['scheduling-dashboard'],
    queryFn: fetchSchedulingDashboard,
    refetchInterval: LIVE_POLL_MS,
    retry: 1,
  });
  const cycle = useQuery({
    queryKey: ['supervisory-status'],
    queryFn: fetchStatus,
    refetchInterval: LIVE_POLL_MS,
  });
  const history = useQuery({
    queryKey: ['scheduling-telemetry-history'],
    queryFn: fetchHistory,
    refetchInterval: LIVE_POLL_MS,
  });
  const { agentMode, isLimitsModalOpen, setIsLimitsModalOpen } = useSupervisoryStore();
  const data = dash.data;
  const offline = dash.isError && !data;
  const chartData = Array.isArray(history.data) ? history.data : [];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={Cpu}
        title="Scheduling & Supervisory Agent"
        subtitle="O1–O4 supervisory optimization · OEH §2"
        badge={agentMode ? String(agentMode) : undefined}
        actions={
          data?.telemetryFreshness ? (
            <StatusBadge tone={toneForStatus(data.telemetryFreshness)}>
              {data.telemetryFreshness}
            </StatusBadge>
          ) : null
        }
      />
      <ChapterChrome chapterId="scheduling" />

      <TopKPIs data={data} backendOffline={offline} />

      <div>
        <h2 className="section-heading-label mb-3">Opportunities</h2>
        <OpportunityCard opportunities={data?.opportunities} backendOffline={offline} />
      </div>

      <MlSectionStrip opportunityIds={['O1', 'O2', 'O3', 'O4']} />
      <ModelStatusPanel opportunities={data?.opportunities} />
      <TemperatureChart data={chartData} />
      <SafetyValidationPanel data={cycle.data} dashboard={data} />
      <AgentDecisionPanel data={cycle.data} actions={data?.candidateActions} />
      <LiveControlLog activities={data?.activity} />

      <EngineeringLimitsModal isOpen={isLimitsModalOpen} onClose={() => setIsLimitsModalOpen(false)} />
    </div>
  );
}
