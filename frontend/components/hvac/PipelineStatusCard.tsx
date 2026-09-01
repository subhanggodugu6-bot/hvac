'use client';

import { Nb2PipelineStrip } from '@/components/hvac/Nb2PipelineStrip';

/** Full ML Registry pipeline panel — single strip with collapsible worker details. */
export function PipelineStatusCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <Nb2PipelineStrip compact />;
  }
  return <Nb2PipelineStrip showRun variant="full" />;
}
