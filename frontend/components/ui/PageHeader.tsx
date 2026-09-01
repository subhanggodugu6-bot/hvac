'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StatusBadge } from '@/components/hvac/StatusBadge';

interface PageHeaderProps {
  backHref?: string;
  backLabel?: string;
  crumb?: string;
  /** @deprecated Decorative icons removed — kept optional for call-site compatibility. */
  icon?: React.ComponentType<{ className?: string }>;
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
    <header className="space-y-4 pb-1">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          {(backHref || crumb) && (
            <nav className="flex items-center gap-2 text-xs text-slate-500 mb-3" aria-label="Breadcrumb">
              {backHref && (
                <Link
                  href={backHref}
                  className="hover:text-violet-700 flex items-center gap-1 transition-colors font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{backLabel}</span>
                </Link>
              )}
              {crumb && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="text-violet-700 font-semibold">{crumb}</span>
                </>
              )}
            </nav>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[1.9rem] font-bold text-slate-900 tracking-tight leading-[1.15]">{title}</h1>
              {badge && (
                <StatusBadge tone="neutral" pulse={false}>
                  {badge}
                </StatusBadge>
              )}
            </div>
            {subtitle && (
              <p className="text-[13px] text-slate-600 mt-2 leading-relaxed max-w-3xl">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="page-rule" aria-hidden="true" />
    </header>
  );
};
