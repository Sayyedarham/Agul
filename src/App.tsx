import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddNodeModal } from './components/AddNodeModal.tsx';
import { DiagnosticsView } from './components/DiagnosticsView.tsx';
import { FleetTable } from './components/FleetTable.tsx';
import { HostHardwareCard } from './components/HostHardwareCard.tsx';
import { KpiStrip } from './components/KpiStrip.tsx';
import { NodeInspectorDrawer } from './components/NodeInspectorDrawer.tsx';
import { SecurityAuditsView } from './components/SecurityAuditsView.tsx';
import { SidebarRail } from './components/SidebarRail.tsx';
import { SocketsView } from './components/SocketsView.tsx';
import { ThroughputChart } from './components/ThroughputChart.tsx';
import { TopBar } from './components/TopBar.tsx';
import type {
  ConsoleSection,
  FleetNode,
  FleetSnapshot,
  HostTelemetry,
  TelemetryPoint,
} from './types/console.ts';

export default function App() {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);

  const [activeSection, setActiveSection] = useState<ConsoleSection>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vlanFilter, setVlanFilter] = useState('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [isSweeping, setIsSweeping] = useState(false);
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [probePrefill, setProbePrefill] = useState<{
    target: string;
    port: number;
  } | null>(null);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNoticeBanner(msg);
    window.setTimeout(() => {
      setNoticeBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const fetchFleet = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch('/api/fleet');
      if (!res.ok) {
        throw new Error(`Telemetry API returned ${res.status}`);
      }
      const data = (await res.json()) as FleetSnapshot;
      setSnapshot(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to reach fleet telemetry backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  useEffect(() => {
    const source = new EventSource('/api/telemetry/stream');
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    source.onmessage = (event) => {
      setStreamConnected(true);
      try {
        const payload = JSON.parse(event.data) as {
          point: TelemetryPoint;
          nodes: FleetNode[];
          hostTelemetry: HostTelemetry;
        };
        setSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: payload.nodes,
            hostTelemetry: payload.hostTelemetry,
            telemetryHistory: [
              ...prev.telemetryHistory.slice(-179),
              payload.point,
            ],
          };
        });
      } catch {
        // Ignore malformed tick frames
      }
    };
    return () => {
      source.close();
    };
  }, []);

  const filteredNodes = useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    return snapshot.nodes.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (vlanFilter !== 'all' && n.vlan !== vlanFilter) return false;
      if (!q) return true;
      return (
        n.hostname.toLowerCase().includes(q) ||
        n.role.toLowerCase().includes(q) ||
        n.ipAddress.includes(q) ||
        n.macAddress.toLowerCase().includes(q) ||
        n.vlan.toLowerCase().includes(q)
      );
    });
  }, [snapshot, searchQuery, statusFilter, vlanFilter]);

  const selectedNode = useMemo(() => {
    if (!snapshot || !selectedNodeId) return null;
    return snapshot.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [snapshot, selectedNodeId]);

  const handleIsolateNode = async (nodeId: string, reason = 'Manual operator quarantine') => {
    const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/isolate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      const data = await res.json();
      setSnapshot(data.snapshot);
      showNotice(`Isolated ${data.node.hostname} to VLAN-999 Quarantine.`);
    }
  };

  const handleRestoreNode = async (nodeId: string) => {
    const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/restore`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      setSnapshot(data.snapshot);
      showNotice(`Restored ${data.node.hostname} to ${data.node.vlan}.`);
    }
  };

  const handleTerminateSocket = async (socketId: string) => {
    const res = await fetch(`/api/sockets/${encodeURIComponent(socketId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = await res.json();
      setSnapshot(data.snapshot);
      showNotice(
        `Terminated ${data.removed.protocol} socket ${data.removed.localAddress}:${data.removed.localPort}.`
      );
    }
  };

  const handleAcknowledgeEvent = async (eventId: string) => {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/ack`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      setSnapshot(data.snapshot);
      showNotice(`Acknowledged security event ${data.event.ruleId}.`);
    }
  };

  const handleRunSweep = async (nodeId = 'all') => {
    setIsSweeping(true);
    try {
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/sweep`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
        showNotice(
          `Integrity sweep complete across ${data.result.sweptNodes} endpoint(s) (${data.result.findings.length} notice(s)).`
        );
      }
    } finally {
      setIsSweeping(false);
    }
  };

  const handleEnrollNode = async (payload: {
    hostname: string;
    role: string;
    ipAddress: string;
    macAddress: string;
    vlan: string;
    rackLocation: string;
    memTotalGb: number;
  }) => {
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      setSnapshot(data.snapshot);
      setSelectedNodeId(data.node.id);
      showNotice(`Enrolled ${data.node.hostname} into ${data.node.vlan}.`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex">
        <div className="w-[240px] border-r border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3 hidden md:block">
          <div className="h-8 bg-[#E2E8F0]/70 rounded-[8px] animate-pulse" />
          <div className="h-6 bg-[#E2E8F0]/60 rounded-[6px] animate-pulse" />
          <div className="h-6 bg-[#E2E8F0]/60 rounded-[6px] animate-pulse" />
          <div className="h-6 bg-[#E2E8F0]/60 rounded-[6px] animate-pulse" />
        </div>
        <div className="flex-1 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-4 animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] animate-pulse" />
          <div className="h-80 rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError || !snapshot) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] p-6 text-center space-y-3">
          <h1 className="text-[16px] font-semibold text-[#0F172A]">
            Telemetry Backend Unreachable
          </h1>
          <p className="text-[13px] text-[#64748B]">
            {loadError || 'Unable to establish connection to SentinelOps API.'}
          </p>
          <button
            type="button"
            onClick={fetchFleet}
            className="h-9 px-4 rounded-[8px] bg-[#0F172A] text-[13px] font-medium text-[#FFFFFF] hover:bg-[#1E293B]"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const latestPoint =
    snapshot.telemetryHistory[snapshot.telemetryHistory.length - 1];

  return (
    <div className="h-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A] flex">
      <div className="hidden md:flex">
        <SidebarRail
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          nodes={snapshot.nodes}
          events={snapshot.events}
          selectedVlanFilter={vlanFilter}
          onSelectVlanFilter={setVlanFilter}
          streamConnected={streamConnected}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <TopBar
          activeSection={activeSection}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRunSweep={() => handleRunSweep('all')}
          isSweeping={isSweeping}
          onOpenAddNode={() => setAddNodeOpen(true)}
        />

        {/* Mobile quick nav */}
        <div className="md:hidden border-b border-[#E2E8F0] bg-[#FFFFFF] px-3 py-1.5 flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'nodes', label: 'Nodes' },
              { id: 'sockets', label: 'Sockets' },
              { id: 'audits', label: 'Audits' },
              { id: 'diagnostics', label: 'Diagnostics' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium whitespace-nowrap ${
                activeSection === item.id
                  ? 'bg-[#0F172A] text-[#FFFFFF]'
                  : 'text-[#475569] bg-[#F1F5F9]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <main className="flex-1 min-w-0 overflow-y-auto p-5 space-y-5">
            {noticeBanner && (
              <div className="rounded-[8px] border border-[#BAE6FD] bg-[#F0F9FF] px-3.5 py-2 flex items-center justify-between gap-3 text-[12px] text-[#00476E]">
                <span>{noticeBanner}</span>
                <button
                  type="button"
                  onClick={() => setNoticeBanner(null)}
                  className="font-mono text-[11px] hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {activeSection === 'overview' && (
              <>
                <KpiStrip
                  nodes={snapshot.nodes}
                  events={snapshot.events}
                  latestPoint={latestPoint}
                  onJumpToAudits={() => setActiveSection('audits')}
                  onFilterStatus={(st) => setStatusFilter(st)}
                />

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                  <div className="xl:col-span-8">
                    <ThroughputChart history={snapshot.telemetryHistory} />
                  </div>
                  <div className="xl:col-span-4">
                    <HostHardwareCard host={snapshot.hostTelemetry} />
                  </div>
                </div>

                <FleetTable
                  nodes={filteredNodes}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  onIsolateNode={(id) => handleIsolateNode(id)}
                  onRestoreNode={handleRestoreNode}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  vlanFilter={vlanFilter}
                  onVlanFilterChange={setVlanFilter}
                />
              </>
            )}

            {activeSection === 'nodes' && (
              <FleetTable
                nodes={filteredNodes}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onIsolateNode={(id) => handleIsolateNode(id)}
                onRestoreNode={handleRestoreNode}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                vlanFilter={vlanFilter}
                onVlanFilterChange={setVlanFilter}
              />
            )}

            {activeSection === 'sockets' && (
              <SocketsView
                sockets={snapshot.sockets}
                nodes={snapshot.nodes}
                searchQuery={searchQuery}
                onTerminateSocket={handleTerminateSocket}
                onSelectNode={setSelectedNodeId}
              />
            )}

            {activeSection === 'audits' && (
              <SecurityAuditsView
                events={snapshot.events}
                nodes={snapshot.nodes}
                searchQuery={searchQuery}
                onAcknowledgeEvent={handleAcknowledgeEvent}
                onIsolateNode={handleIsolateNode}
                onSelectNode={setSelectedNodeId}
              />
            )}

            {activeSection === 'diagnostics' && (
              <DiagnosticsView
                nodes={snapshot.nodes}
                prefillTarget={probePrefill}
              />
            )}
          </main>

          {selectedNode && (
            <NodeInspectorDrawer
              node={selectedNode}
              sockets={snapshot.sockets}
              events={snapshot.events}
              onClose={() => setSelectedNodeId(null)}
              onIsolate={handleIsolateNode}
              onRestore={handleRestoreNode}
              onTerminateSocket={handleTerminateSocket}
              onSweepNode={handleRunSweep}
              onProbeNode={(target, port) => {
                setProbePrefill({ target, port });
                setActiveSection('diagnostics');
              }}
            />
          )}
        </div>
      </div>

      <AddNodeModal
        open={addNodeOpen}
        onClose={() => setAddNodeOpen(false)}
        onSubmit={handleEnrollNode}
      />
    </div>
  );
}
