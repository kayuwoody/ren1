'use client';

import { useRef, useState } from 'react';

export interface TrendPoint {
  date: string;   // YYYY-MM-DD
  value: number;
}

interface Props {
  title: string;
  data: TrendPoint[];            // any order; sorted ascending internally
  color: string;                 // series hue
  format?: (v: number) => string; // value formatter for labels/tooltip
}

// Inline SVG line chart with a linear-regression trend line + hover crosshair.
// Single series → the title names it, no legend (per dataviz guidance).
export default function SalesTrendChart({ title, data, color, format = (v) => String(v) }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const points = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const n = points.length;

  // viewBox geometry
  const W = 820, H = 300;
  const m = { top: 16, right: 20, bottom: 40, left: 60 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;

  if (n === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-sm text-gray-400 py-12 text-center">No data in this period</p>
      </div>
    );
  }

  const maxV = Math.max(...points.map(p => p.value), 0);
  const yMax = maxV > 0 ? maxV * 1.1 : 1;

  const x = (i: number) => m.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => m.top + plotH - Math.max(0, Math.min(v, yMax)) / yMax * plotH;

  // Linear regression (least squares) over index → value
  let trendA = 0, trendB = points[0].value;
  if (n > 1) {
    const xs = points.map((_, i) => i);
    const meanX = xs.reduce((s, v) => s + v, 0) / n;
    const meanY = points.reduce((s, p) => s + p.value, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - meanX) * (points[i].value - meanY); den += (i - meanX) ** 2; }
    trendA = den === 0 ? 0 : num / den;
    trendB = meanY - trendA * meanX;
  }
  const trend = (i: number) => trendA * i + trendB;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');

  // Y gridlines (5 bands)
  const yTicks = Array.from({ length: 5 }, (_, k) => (yMax / 4) * k);
  // X labels — first, last, and a few evenly spaced
  const xLabelIdx = n <= 6
    ? points.map((_, i) => i)
    : [0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1];

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / W;
    const px = e.clientX - rect.left;
    const frac = (px - m.left * scale) / (plotW * scale);
    const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHover(idx);
  };

  const last = points[n - 1];
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <span className="text-xs text-gray-400">trend —— dashed</span>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto' }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Y grid + labels */}
          {yTicks.map((t, k) => (
            <g key={k}>
              <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} stroke="#eef2f7" strokeWidth={1} />
              <text x={m.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">{format(t)}</text>
            </g>
          ))}

          {/* X labels */}
          {xLabelIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 14} textAnchor="middle" fontSize={11} fill="#9ca3af">
              {points[i].date.slice(5)}
            </text>
          ))}

          {/* Trend line (dashed, muted) */}
          {n > 1 && (
            <line
              x1={x(0)} y1={y(trend(0))}
              x2={x(n - 1)} y2={y(trend(n - 1))}
              stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round"
            />
          )}

          {/* Revenue line */}
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* Last-point marker + direct label */}
          <circle cx={x(n - 1)} cy={y(last.value)} r={4} fill={color} stroke="#fff" strokeWidth={2} />

          {/* Hover crosshair + marker */}
          {hp && (
            <g>
              <line x1={x(hover!)} x2={x(hover!)} y1={m.top} y2={m.top + plotH} stroke="#cbd5e1" strokeWidth={1} />
              <circle cx={x(hover!)} cy={y(hp.value)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hp && svgRef.current && (
          <div
            className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(x(hover!) / W) * 100}%`,
              top: `${(y(hp.value) / H) * 100}%`,
              marginTop: '-8px',
              whiteSpace: 'nowrap',
            }}
          >
            <div className="font-semibold">{format(hp.value)}</div>
            <div className="text-gray-300">{hp.date}</div>
          </div>
        )}
      </div>
    </div>
  );
}
