'use client';

import React, { useState, useEffect } from 'react';
import { Sliders } from 'lucide-react';
import { fetchPlantControlDashboard, fetchPlantControlActivity, PlantControlDashboardState } from '@/lib/plantControlApi';
import { SectionDashboard } from '@/components/hvac/SectionDashboard';
import { getOpportunity, TEMP_RESET_OPPS } from '@/lib/hvac/opportunityConfig';
import { MlSectionStrip } from '@/components/hvac/MlSectionStrip';
import { EmptyState } from '@/components/hvac/EmptyState';

export default function PlantControlDashboardPage() {
  const [data, setData] = useState<PlantControlDashboardState | null>(null);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadState = async () => {
      try {
        const [dashRes, actRes] = await Promise.all([
          fetchPlantControlDashboard(),
          fetchPlantControlActivity()
        ]);
        if (isMounted) {
          setData(dashRes);
          setActivities(actRes);
        }
      } catch (err) {
        console.warn('Dashboard fetch error:', err);
      }
    };
    loadState();
    const interval = setInterval(loadState, 8000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const o5 = getOpportunity('O5')!;
  const o9 = getOpportunity('O9')!;
  const [o6, o7, o8] = TEMP_RESET_OPPS;

  return (
    <SectionDashboard
      title="Plant Control Parameter Optimizations"
      subtitle="Duct static pressure, grouped temperature reset, and EXV retrofit. OEH §3"
      icon={Sliders}
      badge="O5–O9"
      chapterId="plant-control"
      kpis={[
        { label: 'Total Power Shed', value: data?.total_power_shed_kw != null ? `${data.total_power_shed_kw} kW` : null },
        { label: 'Daily Energy', value: data?.daily_energy_saved_kwh != null ? `${data.daily_energy_saved_kwh} kWh` : null },
        { label: 'Safety', value: data?.safety_compliance_pct != null ? `${data.safety_compliance_pct}%` : null },
        { label: 'O9 Payback', value: data?.o9_summary?.payback_years != null ? `${data.o9_summary.payback_years} yr` : null },
      ]}
      cards={[
        {
          def: o5,
          status: data?.o5_summary?.status,
          fields: [
            { label: 'Current', value: data?.o5_summary?.current },
            { label: 'Optimized', value: data?.o5_summary?.optimized },
            { label: 'Energy', value: data?.o5_summary?.power_shed_kw != null ? `${data.o5_summary.power_shed_kw} kW` : undefined },
          ],
        },
        {
          def: o6,
          status: data?.o6_summary?.status,
          fields: [
            { label: 'Current', value: data?.o6_summary?.current },
            { label: 'Optimized', value: data?.o6_summary?.optimized },
          ],
        },
        {
          def: o7,
          status: data?.o7_summary?.status,
          fields: [
            { label: 'Current', value: data?.o7_summary?.current },
            { label: 'Optimized', value: data?.o7_summary?.optimized },
          ],
        },
        {
          def: o8,
          status: data?.o8_summary?.status,
          fields: [
            { label: 'Current', value: data?.o8_summary?.current },
            { label: 'Optimized', value: data?.o8_summary?.optimized },
          ],
        },
        {
          def: o9,
          status: data?.o9_summary?.status,
          fields: [
            { label: 'Payback', value: data?.o9_summary?.payback_years != null ? `${data.o9_summary.payback_years} years` : undefined },
            { label: 'ROI', value: data?.o9_summary?.roi_pct != null ? `${data.o9_summary.roi_pct}%` : undefined },
          ],
        },
      ]}
    >
      <MlSectionStrip opportunityIds={['O5', 'O6', 'O7', 'O8', 'O9']} />
      <div className="glass-card p-4">
        <div className="mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Activity</h3>
        </div>
        <div className="space-y-1.5 font-mono text-xs">
          {activities.length === 0 && (
            <EmptyState title="NO DATA" detail="No plant-control activity rows were returned." />
          )}
          {activities.map((act, i) => (
            <div key={act.id || i} className="grid grid-cols-1 sm:grid-cols-[4.5rem_9rem_1fr_5.5rem] gap-1 sm:gap-3 px-2 py-1.5 border border-slate-100 rounded-xl text-slate-600">
              <span className="text-violet-600 font-semibold">{act.opportunity || 'SYS'}</span>
              <span className="text-slate-600 truncate">{act.timestamp}</span>
              <span className="truncate text-slate-700">{act.message}</span>
              <span className="text-emerald-600 sm:text-right">{act.stage}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionDashboard>
  );
}
