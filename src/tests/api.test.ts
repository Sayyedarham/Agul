import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { familyEngine } from '../../server/familyStore.ts';
import { validatePolicy, transitionPolicy } from '../../server/policyEngine.ts';
import { agentAdapter } from '../../server/agentAdapter.ts';

describe('FamilyGuard REST API Endpoints', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    app = express();
    app.use(express.json());

    // Devices
    app.get('/api/family/devices', (_req, res) => {
      res.json(familyEngine.getState().devices);
    });

    app.get('/api/family/devices/:id', (req, res) => {
      const d = familyEngine.getDevice(req.params.id);
      if (!d) return res.status(404).json({ error: 'Device not found' });
      res.json(d);
    });

    // Alerts
    app.get('/api/family/alerts', (_req, res) => {
      res.json(familyEngine.getState().alerts);
    });

    app.post('/api/family/alerts/:id/resolve', (req, res) => {
      const resolved = familyEngine.resolveAlert(req.params.id);
      if (!resolved) return res.status(404).json({ error: 'Alert not found' });
      res.json(resolved);
    });

    // Policies
    app.get('/api/family/policies/:deviceId', (req, res) => {
      const p = familyEngine.getState().policies.find((x) => x.deviceId === req.params.deviceId);
      if (!p) return res.status(404).json({ error: 'Policy not found' });
      res.json(p);
    });

    app.put('/api/family/policies/:deviceId', (req, res) => {
      const errors = validatePolicy(req.body ?? {});
      if (errors.length > 0) return res.status(400).json({ errors });
      const existing = familyEngine.getState().policies.find((x) => x.deviceId === req.params.deviceId);
      if (!existing) return res.status(404).json({ error: 'Policy not found' });
      const merged = { ...existing, ...req.body, deviceId: req.params.deviceId };
      const pending = transitionPolicy(merged, 'apply');
      const updated = familyEngine.updatePolicy(req.params.deviceId, pending);
      res.json(updated);
    });

    // Codes
    app.post('/api/family/enrollment/codes', (_req, res) => {
      const code = familyEngine.generateEnrollCode('parent-test');
      res.status(201).json(code);
    });

    app.post('/api/family/agent/enroll', (req, res) => {
      const { code, deviceName, nickname } = req.body || {};
      if (!code) {
        res.status(400).json({ error: 'Enrollment code is required.' });
        return;
      }
      const result = familyEngine.enrollDevice(
        String(code).trim(),
        String(deviceName || 'Windows PC'),
        String(nickname || deviceName || 'Child Device')
      );
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      const token = `fg-tok-${result.id}-${Math.random().toString(36).slice(2, 10)}`;
      agentAdapter.registerDeviceToken(token, result.id);
      res.status(201).json({ device: result, deviceToken: token, enrollmentToken: token });
    });

    app.post('/api/family/agent/checkin', async (req, res) => {
      const authHeader = req.headers.authorization ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) {
        res.status(401).json({ error: 'Missing Authorization header.' });
        return;
      }
      const deviceId = await agentAdapter.validateToken(token);
      if (!deviceId) {
        res.status(401).json({ error: 'Invalid or expired device token.' });
        return;
      }
      try {
        const response = await agentAdapter.processCheckin(deviceId, req.body);
        res.json(response);
      } catch (err) {
        res.status(500).json({ error: 'Internal server error during checkin.' });
      }
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
  });

  it('GET /api/family/devices returns device fleet', async () => {
    const res = await fetch(`${baseUrl}/api/family/devices`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 3);
    assert.ok(data[0].nickname);
    assert.ok(data[0].healthClass);
  });

  it('GET /api/family/alerts returns prioritized alerts', async () => {
    const res = await fetch(`${baseUrl}/api/family/alerts`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
    assert.ok(data.every((a: any) => typeof a.ruleId === 'string' && a.severity));
  });

  it('POST /api/family/enrollment/codes generates valid code', async () => {
    const res = await fetch(`${baseUrl}/api/family/enrollment/codes`, { method: 'POST' });
    assert.equal(res.status, 201);
    const code = await res.json();
    assert.equal(code.code.length, 8);
    assert.equal(code.used, false);
  });

  it('PUT /api/family/policies/:deviceId updates and validates policy', async () => {
    const devicesRes = await fetch(`${baseUrl}/api/family/devices`);
    const devices = await devicesRes.json();
    const devId = devices[0].id;

    // Valid update
    const updateRes = await fetch(`${baseUrl}/api/family/policies/${devId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bedtime: { enabled: true, startTime: '21:00', endTime: '06:30', days: [1, 2, 3, 4] },
        screenTimeLimitMinutes: 90,
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.state, 'pending');
    assert.equal(updated.screenTimeLimitMinutes, 90);

    // Invalid update
    const invalidRes = await fetch(`${baseUrl}/api/family/policies/${devId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bedtime: { enabled: true, startTime: 'invalid-time', endTime: '06:30', days: [] },
      }),
    });
    assert.equal(invalidRes.status, 400);
  });

  it('POST /api/family/agent/enroll enrolls device with valid code and returns token', async () => {
    // 1. Generate code
    const codeRes = await fetch(`${baseUrl}/api/family/enrollment/codes`, { method: 'POST' });
    const { code } = await codeRes.json();

    // 2. Enroll using code
    const enrollRes = await fetch(`${baseUrl}/api/family/agent/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        deviceName: 'CHILD-SURFACE-PRO',
        nickname: "Lily's Surface",
      }),
    });
    assert.equal(enrollRes.status, 201);
    const enrolled = await enrollRes.json();
    assert.ok(enrolled.deviceToken);
    assert.equal(enrolled.device.deviceName, 'CHILD-SURFACE-PRO');
    assert.equal(enrolled.device.nickname, "Lily's Surface");

    // 3. Check-in with the returned token
    const checkinRes = await fetch(`${baseUrl}/api/family/agent/checkin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${enrolled.deviceToken}`,
      },
      body: JSON.stringify({
        deviceToken: enrolled.deviceToken,
        snapshot: enrolled.device.latestSnapshot,
        immediateEvents: [],
      }),
    });
    assert.equal(checkinRes.status, 200);
    const checkinData = await checkinRes.json();
    assert.ok(checkinData.policy);
  });
});

