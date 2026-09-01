'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: LucideIcon;
  emphasize?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  detail,
  icon: Icon,
  emphasize = false,
}) => {
  return (
    <div className={`kpi-tile ${emphasize ? 'kpi-tile-accent' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase font-bold text-slate-600 tracking-[0.14em]">{label}</span>
        {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${emphasize ? 'text-violet-600' : 'text-slate-500'}`} />}
      </div>
      <div className={`my-2 text-2xl font-bold font-mono tracking-tight ${emphasize ? 'text-violet-800' : 'text-slate-900'}`}>
        {value}
      </div>
      {detail && <div className="text-[10px] text-slate-600 truncate">{detail}</div>}
    </div>
  );
};
