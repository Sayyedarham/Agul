import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { FleetNode, ProbeResult } from '../types/console.ts';
import { formatTimeShort } from '../utils/format.ts';
import { MonoBadge } from './StatusBadge.tsx';

interface DiagnosticsViewProps {
  nodes: FleetNode[];
  prefillTarget?: { target: string; port: number } | null;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  nodes,
  prefillTarget,
}) => {
  const [target, setTarget] = useState('1.1.1.1');
  const [port, setPort] = useState('443');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (prefillTarget) {
      setTarget(prefillTarget.target);
      setPort(String(prefillTarget.port));
    }
  }, [prefillTarget]);

  const executeProbe = async (hostVal: string, portVal: number) => {
    setRunning(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/diagnostics/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: hostVal, port: portVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Probe failed');
      } else {
        setResults((prev) => [data as ProbeResult, ...prev].slice(0, 20));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error during probe');
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    executeProbe(target.trim(), Number(port) || 443);
  };

  const quickTargets = [
    { label: 'Cloudflare DNS (1.1.1.1:443)', target: '1.1.1.1', port: 443 },
    { label: 'Local Controller (:3000)', target: '127.0.0.1', port: 3000 },
    ...nodes.slice(1, 5).map((n) => ({
      label: `${n.hostname} (:${n.openPorts[0] || 22})`,
      target: n.ipAddress,
      port: n.openPorts[0] || 22,
    })),
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
        <div className="h-11 px-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#0F172A]">
            Live DNS & TCP Socket Probe
          </h2>
          <span className="font-mono text-[11px] text-[#64748B]">
            Executes server-side net.Socket + dns.lookup
          </span>
        </div>

        <div className="p-4 space-y-4">
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                Target Hostname or IPv4
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. 1.1.1.1 or core-sw-east.lab.internal"
                className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] font-mono text-[13px] text-[#0F172A] focus:outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
              />
            </div>

            <div className="w-28">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                TCP Port
              </label>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] font-mono text-[13px] text-[#0F172A] tnum focus:outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
              />
            </div>

            <button
              type="submit"
              disabled={running}
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-[8px] bg-[#0F172A] text-[13px] font-medium text-[#FFFFFF] hover:bg-[#1E293B] disabled:opacity-60 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{running ? 'Probing...' : 'Run Probe'}</span>
            </button>
          </form>

          {errorMsg && (
            <div className="rounded-[8px] border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-[#64748B] mr-1">Quick targets:</span>
            {quickTargets.map((qt) => (
              <button
                key={`${qt.target}:${qt.port}`}
                type="button"
                onClick={() => {
                  setTarget(qt.target);
                  setPort(String(qt.port));
                  executeProbe(qt.target, qt.port);
                }}
                className="px-2 py-1 rounded-[6px] border border-[#CBD5E1] bg-[#F8FAFC] font-mono text-[11px] text-[#334155] hover:bg-[#F1F5F9] whitespace-nowrap"
              >
                {qt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] overflow-hidden">
        <div className="h-11 px-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#0F172A]">Probe Results</h3>
          <span className="font-mono text-[11px] text-[#64748B] tnum">
            {results.length} recorded
          </span>
        </div>

        {results.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[#64748B]">
            Select a quick target or enter any reachable host and port above to measure live DNS resolution and TCP handshake latency.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="h-8 bg-[#F1F5F9] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                  <th className="px-4">Checked</th>
                  <th className="px-3">Target</th>
                  <th className="px-3">Resolved IP</th>
                  <th className="px-3">Status</th>
                  <th className="px-3 text-right">DNS Time</th>
                  <th className="px-3 text-right">TCP RTT</th>
                  <th className="px-4">Diagnostic Note</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={`${r.checkedAt}-${i}`}
                    className="h-10 border-b border-[#E2E8F0] last:border-b-0 bg-[#FFFFFF]"
                  >
                    <td className="px-4 font-mono text-[11px] text-[#64748B] tnum">
                      {formatTimeShort(r.checkedAt)}
                    </td>
                    <td className="px-3 font-mono text-[12px] text-[#0F172A]">
                      {r.target}:{r.port}
                    </td>
                    <td className="px-3">
                      {r.resolvedIp ? (
                        <MonoBadge>{r.resolvedIp}</MonoBadge>
                      ) : (
                        <span className="font-mono text-[11px] text-[#64748B]">--</span>
                      )}
                    </td>
                    <td className="px-3">
                      <span
                        className={`inline-flex h-5 items-center gap-1.5 rounded-full px-2 font-mono text-[11px] font-medium ${
                          r.reachable
                            ? 'bg-[#ECFDF5] text-[#065F46]'
                            : 'bg-[#FFF1F2] text-[#9F1239]'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            r.reachable ? 'bg-[#10B981]' : 'bg-[#F43F5E]'
                          }`}
                        />
                        {r.reachable ? 'Reachable' : 'Unreachable'}
                      </span>
                    </td>
                    <td className="px-3 text-right font-mono text-[12px] text-[#334155] tnum">
                      {r.dnsLookupMs !== null ? `${r.dnsLookupMs.toFixed(2)} ms` : '--'}
                    </td>
                    <td className="px-3 text-right font-mono text-[12px] text-[#0F172A] tnum">
                      {r.latencyMs !== null ? `${r.latencyMs.toFixed(2)} ms` : '--'}
                    </td>
                    <td className="px-4 text-[12px] text-[#475569]">
                      {r.error || 'TCP SYN/ACK handshake completed cleanly'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
