import { useState, useEffect } from 'react';
import { X, Plus, Copy, Check, Info } from 'lucide-react';
import type { EnrollmentCode } from '../types/family.ts';

interface Props {
  codes: EnrollmentCode[];
  onGenerate: () => Promise<void>;
  onClose: () => void;
}

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(expiresAt - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(expiresAt - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (remaining <= 0) return <span style={{ color: '#ef5350' }}>Expired</span>;

  const totalSec = Math.floor(remaining / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const color = mins < 5 ? '#ef5350' : mins < 15 ? '#f59e0b' : '#32b984';

  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>Expires in {mins}:{String(secs).padStart(2, '0')}</span>;
}

function CodeDisplay({ code }: { code: EnrollmentCode }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (code.used) {
    return (
      <div style={{
        border: '1px solid #e6e9ee', borderRadius: 10, padding: '14px 16px',
        opacity: 0.5, background: '#f7f8fa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 24, letterSpacing: 6, color: '#a0aab6' }}>
            {code.code}
          </span>
          <span className="pill green" style={{ marginLeft: 'auto' }}>Used</span>
        </div>
        <div style={{ fontSize: 11, color: '#8491a7', marginTop: 6 }}>
          Used {code.usedAt ? new Date(code.usedAt).toLocaleString() : ''}
        </div>
      </div>
    );
  }

  const expired = code.expiresAt < Date.now();

  return (
    <div style={{
      border: '1px solid ' + (expired ? '#e6e9ee' : '#36b68b'),
      borderRadius: 10, padding: '16px 18px',
      background: expired ? '#f7f8fa' : '#f0fdf8',
      opacity: expired ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 28, letterSpacing: 8,
          color: expired ? '#a0aab6' : '#1a2636', fontWeight: 700,
        }}>
          {code.code}
        </span>
        {!expired && (
          <button
            onClick={copy}
            style={{
              marginLeft: 'auto', border: 0, background: 'transparent',
              cursor: 'pointer', color: copied ? '#32b984' : '#536176',
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#768398' }}>
        {expired ? 'Expired' : <Countdown expiresAt={code.expiresAt} />}
        {' · Created ' + new Date(code.createdAt).toLocaleString()}
      </div>
    </div>
  );
}

export default function EnrollModal({ codes, onGenerate, onClose }: Props) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerate();
    } finally {
      setGenerating(false);
    }
  };

  const activeCodes = codes.filter(c => !c.used && c.expiresAt > Date.now());

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '28px 32px',
        width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2636', margin: 0 }}>Enroll a Device</h2>
            <p style={{ fontSize: 13, color: '#768398', margin: '4px 0 0' }}>
              Generate a code and enter it on the Windows device
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer', color: '#8491a7' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Instructions */}
        <div style={{
          background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
          padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 10,
        }}>
          <Info size={16} style={{ color: '#0369a1', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 1.6 }}>
            <strong>How to enroll:</strong><br />
            1. Install the <strong>FamilyGuard Agent</strong> on the Windows device.<br />
            2. Launch the agent setup and enter the 8-character code below when prompted.<br />
            3. The child will see a notification that this device is being managed.
          </div>
        </div>

        {/* Consent note */}
        <div style={{
          background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 10,
          padding: '10px 14px', marginBottom: 24, fontSize: 12, color: '#78350f',
        }}>
          🔔 <strong>Transparency notice:</strong> The child will receive a visible notification
          informing them that FamilyGuard is monitoring this device. This cannot be hidden.
        </div>

        {/* Active codes */}
        {activeCodes.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#768398', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Active Codes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeCodes.map(code => <CodeDisplay key={code.code} code={code} />)}
            </div>
          </div>
        )}

        {/* All codes */}
        {codes.filter(c => c.used || c.expiresAt <= Date.now()).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#768398', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Previous Codes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {codes.filter(c => c.used || c.expiresAt <= Date.now()).map(code => (
                <CodeDisplay key={code.code} code={code} />
              ))}
            </div>
          </div>
        )}

        <button
          className="primary"
          onClick={handleGenerate}
          disabled={generating}
          style={{ width: '100%', justifyContent: 'center', padding: '11px 0' }}
        >
          <Plus size={16} />
          {generating ? 'Generating…' : 'Generate New Code'}
        </button>
      </div>
    </div>
  );
}
