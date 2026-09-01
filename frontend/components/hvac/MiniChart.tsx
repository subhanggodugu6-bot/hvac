'use client';

import React, { useMemo } from 'react';

function nums(values: number[]): { min: number; max: number; span: number } {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  return { min, max, span: Math.max(max - min, 1e-6) };
}

export function MiniLineChart({
  series,
  height = 200,
  colors = ['#f43f5e', '#10b981'],
  labels,
  ariaLabel,
}: {
  series: { key: string; name: string; values: number[] }[];
  height?: number;
  colors?: string[];
  labels?: string[];
  ariaLabel?: string;
}) {
  const w = 400;
  const h = height;
  const all = series.flatMap((s) => s.values);
  const { min, span } = nums(all.length ? all : [0]);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const vals = s.values.length ? s.values : [0];
        return vals
          .map((v, i) => {
            const x = (i / Math.max(vals.length - 1, 1)) * w;
            const y = h - ((v - min) / span) * (h - 12) - 6;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
      }),
    [series, min, span, h],
  );

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} role="img" aria-label={ariaLabel || 'Line chart'}>
        <line x1={0} y1={h - 6} x2={w} y2={h - 6} stroke="#e2e8f0" strokeWidth={1} />
        {paths.map((d, i) => (
          <path key={series[i]?.key || i} d={d} fill="none" stroke={colors[i % colors.length]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      {labels?.length ? (
        <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1 px-0.5">
          {labels.map((l) => (
            <span key={l} className="truncate max-w-[4rem]">
              {l}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-slate-600">
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full" style={{ background: colors[i % colors.length] }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniBarChart({
  items,
  height = 200,
  positiveColor = '#10b981',
  negativeColor = '#94a3b8',
  ariaLabel,
}: {
  items: { label: string; value: number }[];
  height?: number;
  positiveColor?: string;
  negativeColor?: string;
  ariaLabel?: string;
}) {
  const w = 400;
  const h = height;
  const vals = items.map((i) => i.value);
  const absMax = Math.max(...vals.map((v) => Math.abs(v)), 1);
  const barW = Math.min(48, (w - 24) / Math.max(items.length, 1) - 8);
  const zeroY = h / 2;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} role="img" aria-label={ariaLabel || 'Bar chart'}>
        <line x1={12} y1={zeroY} x2={w - 12} y2={zeroY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 4" />
        {items.map((item, i) => {
          const x = 12 + i * ((w - 24) / Math.max(items.length, 1)) + 4;
          const barH = (Math.abs(item.value) / absMax) * (h / 2 - 16);
          const y = item.value >= 0 ? zeroY - barH : zeroY;
          const color = item.value >= 0 ? positiveColor : negativeColor;
          return (
            <g key={item.label}>
              <rect x={x} y={y} width={barW} height={Math.max(barH, 2)} rx={3} fill={color} />
              <text x={x + barW / 2} y={h - 4} textAnchor="middle" fontSize={9} fill="#64748b">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
