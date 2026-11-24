import React from 'react';
import type { PeripheralsSnapshot, PeripheralDevice } from '../../types/family.ts';

interface Props {
  peripherals: PeripheralsSnapshot;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

function isNew(epochMs: number): boolean {
  return Date.now() - epochMs < 5 * 60 * 1000; // < 5 minutes
}

const PeripheralTable: React.FC<{
  devices: PeripheralDevice[];
  showTrust?: boolean;
  emptyMessage: string;
}> = ({ devices, showTrust = false, emptyMessage }) => {
  if (devices.length === 0) {
    return (
      <div style={{ fontSize: 13, color: '#758296', padding: '8px 0' }}>{emptyMessage}</div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#8491a3', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>
          <th style={{ textAlign: 'left', padding: '0 8px 6px 0' }}>Device</th>
          <th style={{ textAlign: 'left', padding: '0 8px 6px 0' }}>Connected</th>
          {showTrust && <th style={{ textAlign: 'left', padding: '0 8px 6px 0' }}>Trust</th>}
          <th style={{ textAlign: 'right', padding: '0 0 6px' }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {devices.map((d) => (
          <tr key={d.id} style={{ borderTop: '1px solid #eef1f3' }}>
            <td style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>
              {d.name}
              {isNew(d.connectedAt) && (
                <span className="pill blue" style={{ marginLeft: 6 }}>New</span>
              )}
            </td>
            <td style={{ padding: '8px 8px 8px 0', color: '#758296' }}>
              {formatTime(d.connectedAt)}
            </td>
            {showTrust && (
              <td style={{ padding: '8px 8px 8px 0' }}>
                <span className={`pill ${d.trusted ? 'green' : 'amber'}`}>
                  {d.trusted ? 'Trusted' : 'Unknown'}
                </span>
              </td>
            )}
            <td style={{ padding: '8px 0 8px', textAlign: 'right' }}>
              <span className="pill green">Connected</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const PeripheralsSection: React.FC<Props> = ({ peripherals }) => {
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="pt">
        <h3>Connected Devices</h3>
      </div>

      <div style={{ paddingTop: 14 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#536176' }}>
            USB ({peripherals.usb.length})
          </div>
          <PeripheralTable
            devices={peripherals.usb}
            showTrust
            emptyMessage="No USB devices connected."
          />
        </div>

        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#536176' }}>
            Bluetooth ({peripherals.bluetooth.length})
          </div>
          <PeripheralTable
            devices={peripherals.bluetooth}
            emptyMessage="No Bluetooth devices connected."
          />
        </div>
      </div>
    </div>
  );
};
