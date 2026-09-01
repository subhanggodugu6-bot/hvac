'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Radio } from 'lucide-react';

interface StatusBannerProps {
  text: string;
  type?: 'success' | 'error' | 'info';
}

export const StatusBanner: React.FC<StatusBannerProps> = ({ text, type = 'info' }) => {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    info: 'bg-violet-50 border-violet-200 text-violet-800',
  };

  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Radio;

  return (
    <div className={`px-4 py-3 rounded-xl border shadow-sm flex items-center gap-2.5 text-xs font-semibold ${styles[type]}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
};
