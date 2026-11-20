import React, { useMemo, useState } from 'react';
import type { TelemetryPoint } from '../types/console.ts';
import { formatThroughput, formatTimeShort } from '../utils/format.ts';

interface ThroughputChartProps {
  history: TelemetryPoint[];
}

export const ThroughputChart: React.FC<ThroughputChartProps> = ({ history }) => {
  const [windowSize, setWindowSize] = useState<60 | 180>(60);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const slice = useMemo(() => {
    if (history.length <= windowSize) return history;
    return history.slice(-windowSize);
  }, [history, windowSize]);

  const width = 760;
  const height = 220;
  const padLeft = 48;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxThroughput = useMemo(() => {
    const peak = slice.reduce(
      (max, p) => Math.max(max, p.rxMbps, p.txMbps),
      2000
    );
    return Math.ceil((peak * 1.15) / 1000) * 1000;
  }, [slice]);

  const rxPoints = useMemo(() => {
    if (slice.length < 2) return '';
    return slice
      .map((p, i) => {
        const x = padLeft + (i / (slice.length - 1)) * plotW;
        const y = padTop + plotH - (p.rxMbps / maxThroughput) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [slice, maxThroughput, plotW, plotH]);

  const txPoints = useMemo(() => {
    if (slice.length < 2) return '';
    return slice
      .map((p, i) => {
        const x = padLeft + (i / (slice.length - 1)) * plotW;
        const y = padTop + plotH - (p.txMbps / maxThroughput) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [slice, maxThroughput, plotW, plotH]);

  const rxArea = useMemo(() => {
    if (slice.length < 2) return '';
    const firstX = padLeft;
    const lastX = padLeft + plotW;
    const baseY = padTop + plotH;
    return `${firstX},${baseY} ${rxPoints} ${lastX},${baseY}`;
  }, [rxPoints, slice.length, plotW, plotH]);

  const activePoint =
    hoverIdx !== null && slice[hoverIdx]
      ? slice[hoverIdx]
      : slice[slice.length - 1];

  const activeX =
    hoverIdx !== null && slice.length > 1
      ? padLeft + (hoverIdx / (slice.length - 1)) * plotW
      : null;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] flex flex-col">
      <div className="h-11 px-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-[14px] font-semibold text-[#0F172A] truncate">
            Real-Time Fleet Throughput Stream
          </h2>
          <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-[#475569] tnum">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px] bg-[#0284C7]" />
              RX {activePoint ? formatThroughput(activePoint.rxMbps) : '--'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px] bg-[#10B981]" />
              TX {activePoint ? formatThroughput(activePoint.txMbps) : '--'}
            </span>
            <span className="text-[#64748B]">
              RTT {activePoint ? `${activePoint.meanLatencyMs.toFixed(1)} ms` : '--'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-[#F1F5F9] rounded-[6px] shrink-0">
          <button
            type="button"
            onClick={() => setWindowSize(60)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded-[4px] transition-colors whitespace-nowrap ${
              windowSize === 60
                ? 'bg-[#FFFFFF] text-[#0F172A] font-medium shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            1m
          </button>
          <button
            type="button"
            onClick={() => setWindowSize(180)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded-[4px] transition-colors whitespace-nowrap ${
              windowSize === 180
                ? 'bg-[#FFFFFF] text-[#0F172A] font-medium shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            3m
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-[220px] overflow-visible select-none"
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              if (slice.length < 2) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              const clamped = Math.max(padLeft, Math.min(padLeft + plotW, relX));
              const ratio = (clamped - padLeft) / plotW;
              setHoverIdx(Math.round(ratio * (slice.length - 1)));
            }}
          >
            {yTicks.map((t) => {
              const y = padTop + plotH - t * plotH;
              const val = (maxThroughput * t) / 1000;
              return (
                <g key={t}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotW}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray={t === 0 ? undefined : '2 3'}
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-[#64748B] font-mono text-[10px]"
                  >
                    {val.toFixed(1)}G
                  </text>
                </g>
              );
            })}

            {rxArea && (
              <polygon points={rxArea} fill="#0284C7" fillOpacity={0.08} />
            )}
            {rxPoints && (
              <polyline
                fill="none"
                stroke="#0284C7"
                strokeWidth={1.75}
                strokeLinejoin="round"
                points={rxPoints}
              />
            )}
            {txPoints && (
              <polyline
                fill="none"
                stroke="#10B981"
                strokeWidth={1.5}
                strokeLinejoin="round"
                points={txPoints}
              />
            )}

            {activeX !== null && activePoint && (
              <g>
                <line
                  x1={activeX}
                  y1={padTop}
                  x2={activeX}
                  y2={padTop + plotH}
                  stroke="#94A3B8"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />
                <circle
                  cx={activeX}
                  cy={
                    padTop +
                    plotH -
                    (activePoint.rxMbps / maxThroughput) * plotH
                  }
                  r={3.5}
                  fill="#0284C7"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
                <circle
                  cx={activeX}
                  cy={
                    padTop +
                    plotH -
                    (activePoint.txMbps / maxThroughput) * plotH
                  }
                  r={3.5}
                  fill="#10B981"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {slice.length > 1 && (
              <>
                <text
                  x={padLeft}
                  y={height - 6}
                  textAnchor="start"
                  className="fill-[#64748B] font-mono text-[10px]"
                >
                  {formatTimeShort(slice[0].timestamp)}
                </text>
                <text
                  x={padLeft + plotW / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-[#64748B] font-mono text-[10px]"
                >
                  {formatTimeShort(slice[Math.floor(slice.length / 2)].timestamp)}
                </text>
                <text
                  x={padLeft + plotW}
                  y={height - 6}
                  textAnchor="end"
                  className="fill-[#64748B] font-mono text-[10px]"
                >
                  {formatTimeShort(slice[slice.length - 1].timestamp)}
                </text>
              </>
            )}
          </svg>
        </div>
      </div>
    </section>
  );
};
