'use client';

import React from 'react';

interface SectionTitleProps {
  children: React.ReactNode;
  hint?: string;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({ children, hint }) => {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {hint ? <span className="text-[11px] font-mono text-slate-500">{hint}</span> : null}
    </div>
  );
};
