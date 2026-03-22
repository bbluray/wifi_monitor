import { Router } from 'express';
import { getDeviceById, getDeviceTimeline, listVisibleDevices, updateDevice } from '../services/deviceService.js';

const router = Router();

router.get('/devices', (_req, res) => {
  return res.json(listVisibleDevices());
});

router.patch('/devices/:id/name', (req, res) => {
  const deviceId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(deviceId)) {
    return res.status(400).json({ message: '无效的设备 ID' });
  }

  const device = getDeviceById(deviceId);
  if (!device || !device.isVisible) {
    return res.status(404).json({ message: '设备不存在或未公开展示' });
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ message: '设备名称不能为空' });
  }

  const updated = updateDevice(deviceId, { name });
  return res.json(updated);
});

router.get('/devices/:id/timeline', (req, res) => {
  const deviceId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(deviceId)) {
    return res.status(400).json({ message: '无效的设备 ID' });
  }

  const range = String(req.query.range ?? '7d');
  const normalizedRange = range === '1d' || range === '7d' ? range : '7d';
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;

  const device = getDeviceById(deviceId);
  if (!device || !device.isVisible) {
    return res.status(404).json({ message: '设备不存在或未公开展示' });
  }

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

export default router;
