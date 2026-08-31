'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge, toneForStatus } from '@/components/hvac/StatusBadge';
import { EmptyState } from '@/components/hvac/EmptyState';
import { PlantCanvas } from './PlantCanvas';
import { hvacFetch, apiJson } from '@/lib/api/client';
import { PLATFORM_POLL_MS } from '@/lib/hvac/poll';
import type { DashboardHome, PlantEquipment } from '@/lib/hvac/dashboardHome';

const CHAPTER_LAYERS: Record<string, string[]> = {
  scheduling: ['zones', 'ahus', 'chillers'],
  'plant-control': ['ahus', 'vavs', 'hot_water', 'chillers', 'condenser_water'],
  ventilation: ['ahus', 'zones'],
  'variable-speed': ['pumps', 'vfds', 'chillers', 'condenser_water'],
  operations: ['chillers', 'zones'],
};

export function ChapterChrome({ chapterId }: { chapterId: string }) {
  const home = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: async (): Promise<DashboardHome> => apiJson('/platform/dashboard/home'),
    refetchInterval: PLATFORM_POLL_MS,
  });
  const data = home.data;
  const ch = data?.chapters?.find((c) => c.id === chapterId);
  const layers: Record<string, PlantEquipment[]> = {};
  for (const k of CHAPTER_LAYERS[chapterId] || []) {
    const rows = data?.layers?.[k];
    if (rows?.length) layers[k] = rows;
  }
  const [selected, setSelected] = useState<PlantEquipment | null>(null);
  const tel = String(data?.telemetry?.status || 'NO DATA');

  return (
    <div className="space-y-3 -mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-mono text-slate-500">
          {ch?.section || 'OEH / AIRAH chapter'} · GUIDE_POTENTIAL is not measured LIVE kW
        </p>
        <StatusBadge tone={toneForStatus(tel)} pulse={tel === 'LIVE'}>
          {tel}
        </StatusBadge>
        <StatusBadge tone={toneForStatus(data?.bms?.status)} pulse={false}>
          BMS {data?.bms?.status || 'DISCONNECTED'}
        </StatusBadge>
      </div>
      {Object.keys(layers).length > 0 ? (
        <PlantCanvas layers={layers} selectedId={selected?.equipment_id} onSelect={setSelected} compact />
      ) : home.isFetched ? (
        <EmptyState
          title="NO PLANT LAYERS"
          detail="No equipment layers for this chapter yet. Map devices in Gateway or wait for plant inventory."
          href="/platform/bms"
          actionLabel="Open Gateway"
          onRetry={() => void home.refetch()}
        />
      ) : null}
    </div>
  );
}
