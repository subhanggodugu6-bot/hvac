'use client';

import React from 'react';
import type { DashboardOpportunity, PlantEquipment } from '@/lib/hvac/dashboardHome';
import { AssetRail } from './AssetRail';
import { PlantCanvas } from './PlantCanvas';

/** Side-by-side plant inventory + selected asset tables in one card. */
export function PlantAssetPanel({
  layers,
  selected,
  selectedId,
  onSelect,
  opportunities,
  telStatus,
}: {
  layers?: Record<string, PlantEquipment[]>;
  selected: PlantEquipment | null;
  selectedId?: string | null;
  onSelect: (row: PlantEquipment) => void;
  opportunities: DashboardOpportunity[];
  telStatus?: string;
}) {
  return (
    <section className="card-static overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-slate-100 min-h-[360px]">
        <PlantCanvas layers={layers} selectedId={selectedId} onSelect={onSelect} embedded />
        <AssetRail selected={selected} opportunities={opportunities} telStatus={telStatus} embedded />
      </div>
    </section>
  );
}
