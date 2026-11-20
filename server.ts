import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fleetEngine } from './server/fleetStore.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/api/fleet', (_req, res) => {
    res.json(fleetEngine.getSnapshot());
  });

  app.get('/api/telemetry/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const onTick = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    fleetEngine.on('tick', onTick);
    req.on('close', () => {
      fleetEngine.off('tick', onTick);
    });
  });

  app.post('/api/nodes', (req, res) => {
    const { hostname, role, ipAddress, macAddress, vlan, rackLocation, memTotalGb } =
      req.body || {};

    if (!hostname || !ipAddress || !macAddress) {
      res.status(400).json({ error: 'Hostname, IPv4 address, and MAC address are required.' });
      return;
    }

    const created = fleetEngine.addNode({
      hostname: String(hostname),
      role: String(role || 'Managed Compute Node'),
      ipAddress: String(ipAddress),
      macAddress: String(macAddress),
      vlan: String(vlan || 'VLAN-20'),
      rackLocation: String(rackLocation || 'Rack B4 · U01'),
      memTotalGb: Number(memTotalGb) || 64,
    });
    res.status(201).json({ node: created, snapshot: fleetEngine.getSnapshot() });
  });

  app.post('/api/nodes/:id/isolate', (req, res) => {
    const { reason } = req.body || {};
    const updated = fleetEngine.isolateNode(req.params.id, reason);
    if (!updated) {
      res.status(400).json({ error: 'Node not found or cannot isolate active controller.' });
      return;
    }
    res.json({ node: updated, snapshot: fleetEngine.getSnapshot() });
  });

  app.post('/api/nodes/:id/restore', (req, res) => {
    const updated = fleetEngine.restoreNode(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Node not found.' });
      return;
    }
    res.json({ node: updated, snapshot: fleetEngine.getSnapshot() });
  });

  app.post('/api/nodes/:id/sweep', (req, res) => {
    const nodeId = req.params.id === 'all' ? undefined : req.params.id;
    const result = fleetEngine.runFleetSweep(nodeId);
    res.json({ result, snapshot: fleetEngine.getSnapshot() });
  });

  app.delete('/api/sockets/:id', (req, res) => {
    const removed = fleetEngine.terminateSocket(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Socket session not found.' });
      return;
    }
    res.json({ removed, snapshot: fleetEngine.getSnapshot() });
  });

  app.post('/api/events/:id/ack', (req, res) => {
    const updated = fleetEngine.acknowledgeEvent(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Audit event not found.' });
      return;
    }
    res.json({ event: updated, snapshot: fleetEngine.getSnapshot() });
  });

  app.post('/api/diagnostics/probe', async (req, res) => {
    const { target, port } = req.body || {};
    if (!target || typeof target !== 'string') {
      res.status(400).json({ error: 'Target hostname or IP address is required.' });
      return;
    }
    const parsedPort = Math.min(65535, Math.max(1, Number(port) || 443));
    const result = await fleetEngine.runLiveProbe(target, parsedPort);
    res.json(result);
  });

  app.get('/api/audit/export', (_req, res) => {
    const csv = fleetEngine.exportAuditCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sentinelops-audit-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SentinelOps console listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
