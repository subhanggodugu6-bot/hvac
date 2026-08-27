'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/hvac/StatusBadge';

interface PageHeaderProps {
  backHref?: string;
  backLabel?: string;
  crumb?: string;
  /** @deprecated Decorative icons removed — kept optional for call-site compatibility. */
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  backHref,
  backLabel,
  crumb,
  title,
  subtitle,
  badge,
  actions,
}) => {
  return (
    <div className="space-y-4 pb-1">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          {(backHref || crumb) && (
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
              {backHref && (
                <Link href={backHref} className="hover:text-violet-600 flex items-center gap-1 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{backLabel}</span>
                </Link>
              )}
              {crumb && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="text-violet-600 font-semibold">{crumb}</span>
                </>
              )}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[1.85rem] font-bold text-slate-900 tracking-tight leading-tight">{title}</h1>
              {badge && (
                <StatusBadge tone="neutral" pulse={false}>
                  {badge}
                </StatusBadge>
              )}
            </div>
            {subtitle && <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed max-w-3xl">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="page-rule" />
    </div>
  );
};
