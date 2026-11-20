import React, { useState } from 'react';
import { X } from 'lucide-react';

interface AddNodeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    hostname: string;
    role: string;
    ipAddress: string;
    macAddress: string;
    vlan: string;
    rackLocation: string;
    memTotalGb: number;
  }) => Promise<void>;
}

export const AddNodeModal: React.FC<AddNodeModalProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [hostname, setHostname] = useState('worker-node-12.compute.internal');
  const [role, setRole] = useState('Compute Worker Node');
  const [ipAddress, setIpAddress] = useState('10.24.20.44');
  const [macAddress, setMacAddress] = useState('0C:42:A1:7E:22:44');
  const [vlan, setVlan] = useState('VLAN-20');
  const [rackLocation, setRackLocation] = useState('Rack B4 · U08');
  const [memTotalGb, setMemTotalGb] = useState('128');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        hostname,
        role,
        ipAddress,
        macAddress,
        vlan,
        rackLocation,
        memTotalGb: Number(memTotalGb) || 64,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F172A]/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enroll-node-title"
    >
      <div className="w-full max-w-md rounded-[10px] border border-[#E2E8F0] bg-[#FFFFFF] shadow-lg overflow-hidden">
        <div className="h-11 px-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h2 id="enroll-node-title" className="text-[14px] font-semibold text-[#0F172A]">
            Enroll Managed Endpoint
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-[12px]">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
              Hostname (FQDN)
            </label>
            <input
              required
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] font-mono text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                IPv4 Address
              </label>
              <input
                required
                type="text"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] font-mono text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                MAC Address
              </label>
              <input
                required
                type="text"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] font-mono text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                VLAN Segment
              </label>
              <select
                value={vlan}
                onChange={(e) => setVlan(e.target.value)}
                className="w-full h-9 px-2.5 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] font-mono text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              >
                <option value="VLAN-10">VLAN-10 Core</option>
                <option value="VLAN-20">VLAN-20 Compute</option>
                <option value="VLAN-30">VLAN-30 Edge</option>
                <option value="VLAN-40">VLAN-40 Storage</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                Memory (GB)
              </label>
              <input
                type="number"
                min={4}
                max={2048}
                value={memTotalGb}
                onChange={(e) => setMemTotalGb(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] font-mono text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                Hardware Role
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-1">
                Rack / Location
              </label>
              <input
                type="text"
                value={rackLocation}
                onChange={(e) => setRackLocation(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] border border-[#CBD5E1] text-[12px] text-[#0F172A] focus:outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[8px] border border-[#CBD5E1] bg-[#FFFFFF] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-8 px-3.5 rounded-[8px] bg-[#0F172A] text-[12px] font-medium text-[#FFFFFF] hover:bg-[#1E293B] disabled:opacity-60"
            >
              {submitting ? 'Enrolling...' : 'Enroll Endpoint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
