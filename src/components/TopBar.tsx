import React, { useEffect, useRef } from 'react';
import { Download, Plus, RefreshCw, Search } from 'lucide-react';
import type { ConsoleSection } from '../types/console.ts';

interface TopBarProps {
  activeSection: ConsoleSection;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onRunSweep: () => void;
  isSweeping: boolean;
  onOpenAddNode: () => void;
}

const SECTION_LABELS: Record<ConsoleSection, string> = {
  overview: 'Fleet Surveillance',
  nodes: 'Node Inventory',
  sockets: 'Network & Sockets',
  audits: 'Security Audits',
  diagnostics: 'Live Diagnostics',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  searchQuery,
  onSearchChange,
  onRunSweep,
  isSweeping,
  onOpenAddNode,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="h-12 shrink-0 border-b border-[#E2E8F0] bg-[#FFFFFF] px-5 flex items-center justify-between gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] text-[#64748B] whitespace-nowrap">
          Cluster East-Lab
        </span>
        <span className="text-[#CBD5E1]" aria-hidden="true">
          /
        </span>
        <span className="text-[12px] text-[#64748B] whitespace-nowrap hidden sm:inline">
          Production LAN
        </span>
        <span className="text-[#CBD5E1] hidden sm:inline" aria-hidden="true">
          /
        </span>
        <span className="text-[13px] font-medium text-[#0F172A] truncate">
          {SECTION_LABELS[activeSection]}
        </span>
      </nav>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="relative w-64 hidden md:block">
          <Search className="h-3.5 w-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter hostname, IP, MAC, rule..."
            className="w-full h-8 pl-8 pr-11 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[#94A3B8] pointer-events-none">
            ⌘K
          </kbd>
        </div>

        <a
          href="/api/audit/export"
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5 text-[#64748B]" />
          <span>Export CSV</span>
        </a>

        <button
          type="button"
          onClick={onOpenAddNode}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5 text-[#64748B]" />
          <span>Enroll Node</span>
        </button>

        <button
          type="button"
          onClick={onRunSweep}
          disabled={isSweeping}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-[8px] bg-[#0F172A] text-[12px] font-medium text-[#FFFFFF] hover:bg-[#1E293B] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSweeping ? 'animate-spin' : ''}`} />
          <span>{isSweeping ? 'Sweeping...' : 'Run Fleet Sweep'}</span>
        </button>
      </div>
    </header>
  );
};
