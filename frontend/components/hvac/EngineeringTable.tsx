'use client';

import React from 'react';

export const EngineeringTable: React.FC<{ children: React.ReactNode; minWidth?: string }> = ({
  children,
  minWidth = '44rem',
}) => (
  <div className="eng-scroll rounded-xl border border-slate-200 bg-white">
    <table className="bms-table" style={{ minWidth }}>
      {children}
    </table>
  </div>
);
