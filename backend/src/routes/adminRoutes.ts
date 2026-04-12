import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware.js';
import { createDevice, deleteDevice, getDeviceById, getDeviceTimeline, listAllDevices, updateDevice } from '../services/deviceService.js';
import { createRouter, deleteRouter, getRouterById, listRouters, updateRouter } from '../services/routerService.js';
import { runCollectorOnce } from '../services/collector.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/routers', (_req, res) => {
  return res.json(listRouters());
});

router.post('/routers', (req, res) => {
  const payload = req.body as any;
  if (!payload.name || !payload.host || !payload.community) {
    return res.status(400).json({ message: '名称、主机、community 必填' });
  }

  const port = Number(payload.port ?? 161);
  if (!Number.isFinite(port) || port <= 0) {
    return res.status(400).json({ message: '端口必须为正整数' });
  }

  const snmpVersion = payload.snmpVersion === '1' || payload.snmpVersion === 'mock' ? payload.snmpVersion : '2c';

  const created = createRouter({
    name: String(payload.name),
    host: String(payload.host),
    port,
    community: String(payload.community),
    snmpVersion,
    arpMacOid: typeof payload.arpMacOid === 'string' ? payload.arpMacOid : undefined,
    pollIntervalMinutes: Number(payload.pollIntervalMinutes ?? 5),
    offlineDelayCount: Number(payload.offlineDelayCount ?? 2),
    offlineDelayMinutes: Number(payload.offlineDelayMinutes ?? 10),
    isActive: payload.isActive !== false,
  });

  return res.status(201).json(created);
});

router.patch('/routers/:id', (req, res) => {
  const routerId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(routerId)) {
    return res.status(400).json({ message: '无效的路由器 ID' });
  }

  if (!getRouterById(routerId)) {
    return res.status(404).json({ message: '路由器不存在' });
  }

  const payload = req.body as any;
  const updated = updateRouter(routerId, {
    name: typeof payload.name === 'string' ? payload.name : undefined,
    host: typeof payload.host === 'string' ? payload.host : undefined,
    port: typeof payload.port !== 'undefined' ? Number(payload.port) : undefined,
    snmpVersion:
      payload.snmpVersion === '1' || payload.snmpVersion === '2c' || payload.snmpVersion === 'mock'
        ? payload.snmpVersion
        : undefined,
    community: typeof payload.community === 'string' ? payload.community : undefined,
    arpMacOid: typeof payload.arpMacOid === 'string' ? payload.arpMacOid : undefined,
    pollIntervalMinutes:
      typeof payload.pollIntervalMinutes !== 'undefined'
        ? Number(payload.pollIntervalMinutes)
        : undefined,
    offlineDelayCount:
      typeof payload.offlineDelayCount !== 'undefined'
        ? Number(payload.offlineDelayCount)
        : undefined,
    offlineDelayMinutes:
      typeof payload.offlineDelayMinutes !== 'undefined'
        ? Number(payload.offlineDelayMinutes)
        : undefined,
    isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined,
  });

  return res.json(updated);
});

router.delete('/routers/:id', (req, res) => {
  const routerId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(routerId)) {
    return res.status(400).json({ message: '无效的路由器 ID' });
  }

  if (!getRouterById(routerId)) {
    return res.status(404).json({ message: '路由器不存在' });
  }

  deleteRouter(routerId);
  return res.status(204).send();
});

router.get('/devices', (_req, res) => {
  return res.json(listAllDevices());
});

router.get('/devices/:id/timeline', (req, res) => {
  const deviceId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(deviceId)) {
    return res.status(400).json({ message: '无效的设备 ID' });
  }

  const device = getDeviceById(deviceId);
  if (!device) {
    return res.status(404).json({ message: '设备不存在' });
  }

  const range = String(req.query.range ?? '7d');
  const normalizedRange = range === '1d' || range === '7d' ? range : '7d';
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;

  const timeline = getDeviceTimeline(deviceId, normalizedRange, date);
  if (!timeline) {
    return res.status(404).json({ message: '设备不存在' });
  }

  return res.json({
    device,
    range: normalizedRange,
    timeline: timeline.timeline,
    segments: timeline.segments,
  });
});

router.post('/devices', (req, res) => {
  const payload = req.body as any;
  if (!payload.macAddress) {
    return res.status(400).json({ message: 'MAC 地址必填' });
  }

  try {
    const created = createDevice({
      name: typeof payload.name === 'string' ? payload.name : '',
      macAddress: String(payload.macAddress),
      note: typeof payload.note === 'string' ? payload.note : '',
      isVisible: payload.isVisible === true,
    });
    return res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return res.status(409).json({ message: 'MAC 地址已存在' });
    }
    return res.status(400).json({ message: (error as Error).message });
  }
});

router.patch('/devices/:id', (req, res) => {
  const deviceId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(deviceId)) {
    return res.status(400).json({ message: '无效的设备 ID' });
  }

  if (!getDeviceById(deviceId)) {
    return res.status(404).json({ message: '设备不存在' });
  }

  try {
    const updated = updateDevice(deviceId, {
      name: typeof req.body.name === 'string' ? req.body.name : undefined,
      macAddress: typeof req.body.macAddress === 'string' ? req.body.macAddress : undefined,
      note: typeof req.body.note === 'string' ? req.body.note : undefined,
      isVisible: typeof req.body.isVisible === 'boolean' ? req.body.isVisible : undefined,
    });
    return res.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return res.status(409).json({ message: 'MAC 地址已存在' });
    }
    return res.status(400).json({ message: (error as Error).message });
  }
});

router.delete('/devices/:id', (req, res) => {
  const deviceId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(deviceId)) {
    return res.status(400).json({ message: '无效的设备 ID' });
  }

  try {
    deleteDevice(deviceId);
    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除设备失败';
    return res.status(message === '设备不存在' ? 404 : 500).json({ message });
  }
});

router.post('/collect/run', async (_req, res) => {
  const result = await runCollectorOnce(true);
  return res.json({ count: result.length, result });
});

export default router;
