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
        <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-[0.14em]">{label}</span>
        {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${emphasize ? 'text-cyan-400' : 'text-slate-500'}`} />}
      </div>
      <div className={`my-1.5 text-2xl font-semibold font-mono tracking-tight ${emphasize ? 'text-cyan-800' : 'text-slate-900'}`}>
        {value}
      </div>
      {detail && <div className="text-[10px] text-slate-400 truncate">{detail}</div>}
    </div>
  );
};
