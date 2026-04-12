import dayjs from 'dayjs';
import { db } from '../db.js';
import { PRESENCE_BUCKET_MINUTES, OFFLINE_DELAY_MINUTES } from '../config.js';

export interface DeviceListItem {
  id: number;
  name: string;
  displayName: string;
  macAddress: string;
  ipAddress: string | null;
  note: string;
  isVisible: boolean;
  lastSeenAt: string | null;
  isOnline: boolean;
  onlineMinutes1d: number;
  onlineMinutes7d: number;
  onlineMinutes30d: number;
}

export interface DeviceTimelinePoint {
  bucketStart: string;
  label: string;
  onlineMinutes: number;
}

export interface DeviceTimelineSegment {
  status: 'online' | 'offline' | 'pending';
  startAt: string;
  endAt: string;
  minutes: number;
  dayLabel?: string;
}

export interface DeviceTimelineResult {
  timeline: DeviceTimelinePoint[];
  segments?: DeviceTimelineSegment[];
}

export interface DeviceInput {
  name?: string;
  macAddress: string;
  ipAddress?: string;
  note?: string;
  isVisible?: boolean;
}

export interface DeviceUpdateInput {
  name?: string;
  macAddress?: string;
  ipAddress?: string;
  note?: string;
  isVisible?: boolean;
}

interface DeviceRow {
  id: number;
  name: string;
  mac_address: string;
  ip_address: string | null;
  note: string;
  is_visible: number;
  last_seen_at: string | null;
  is_online: number;
  missed_count: number;
  created_at: string;
  updated_at: string;
}

function createBuckets(count: number, unit: 'hour' | 'day') {
  const buckets: Array<{ start: string; label: string }> = [];
  const now = dayjs();

  if (unit === 'hour') {
    const anchor = now.startOf('hour');
    for (let index = count - 1; index >= 0; index -= 1) {
      const current = anchor.subtract(index, 'hour');
      buckets.push({
        start: current.toISOString(),
        label: current.format('MM-DD HH:00'),
      });
    }
    return buckets;
  }

  const anchor = now.startOf('day');
  for (let index = count - 1; index >= 0; index -= 1) {
    const current = anchor.subtract(index, 'day');
    buckets.push({
      start: current.toISOString(),
      label: current.format('MM-DD'),
    });
  }
  return buckets;
}

export function normalizeMac(input: string) {
  const compact = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (compact.length !== 12) {
    throw new Error('MAC 地址格式不正确');
  }
  return compact.match(/.{1,2}/g)!.join(':');
}

function safeNormalizeMac(input: string) {
  try {
    return normalizeMac(input);
  } catch {
    return null;
  }
}

function toObservationBucket(observedAt: string) {
  const current = dayjs(observedAt);
  const minutes = current.minute();
  const rounded = Math.floor(minutes / PRESENCE_BUCKET_MINUTES) * PRESENCE_BUCKET_MINUTES;
  return current.minute(rounded).second(0).millisecond(0).toISOString();
}

function mapListRow(row: any): DeviceListItem {
  const name = (row.name ?? '').trim();
  const macAddress = row.mac_address as string;
  const displayName = name.length > 0 ? name : macAddress;
  const lastSeenAt = (row.last_seen_at as string | null) ?? null;
  const offlineDelayMinutes = Number(row.effective_offline_delay_minutes ?? OFFLINE_DELAY_MINUTES);
  const isOnline = lastSeenAt
    ? dayjs(lastSeenAt).isAfter(dayjs().subtract(offlineDelayMinutes, 'minute'))
    : false;

  return {
    id: Number(row.id),
    name,
    displayName,
    macAddress,
    ipAddress: (row.ip_address as string | null) ?? null,
    note: (row.note ?? '') as string,
    isVisible: Boolean(row.is_visible),
    lastSeenAt,
    isOnline,
    onlineMinutes1d: Number(row.online_minutes_1d ?? 0),
    onlineMinutes7d: Number(row.online_minutes_7d ?? 0),
    onlineMinutes30d: Number(row.online_minutes_30d ?? 0),
  };
}

function listDeviceRows(whereClause: string, values: unknown[]) {
  const now = dayjs();
  const nowIso = now.toISOString();
  const todayStart = now.startOf('day').toISOString();
  const last7DaysStart = now.subtract(7, 'day').toISOString();
  const last30DaysStart = now.subtract(30, 'day').toISOString();

  return db.prepare(`
    SELECT
      d.*,
      (
        SELECT COALESCE(MIN(r.offline_delay_minutes), ${OFFLINE_DELAY_MINUTES})
        FROM routers r
        WHERE r.is_active = 1
      ) AS effective_offline_delay_minutes,
      (
        SELECT COALESCE(SUM(
          MAX(0, CAST(ROUND(
            (JULIANDAY(MIN(COALESCE(ended_at, ?), ?)) - JULIANDAY(MAX(started_at, ?))) * 24 * 60
          ) AS INTEGER))
        ), 0)
        FROM device_sessions
        WHERE device_id = d.id
          AND status = 'online'
          AND started_at < ?
          AND (ended_at IS NULL OR ended_at > ?)
      ) AS online_minutes_1d,
      (
        SELECT COALESCE(SUM(
          MAX(0, CAST(ROUND(
            (JULIANDAY(MIN(COALESCE(ended_at, ?), ?)) - JULIANDAY(MAX(started_at, ?))) * 24 * 60
          ) AS INTEGER))
        ), 0)
        FROM device_sessions
        WHERE device_id = d.id
          AND status = 'online'
          AND started_at < ?
          AND (ended_at IS NULL OR ended_at > ?)
      ) AS online_minutes_7d,
      (
        SELECT COALESCE(SUM(
          MAX(0, CAST(ROUND(
            (JULIANDAY(MIN(COALESCE(ended_at, ?), ?)) - JULIANDAY(MAX(started_at, ?))) * 24 * 60
          ) AS INTEGER))
        ), 0)
        FROM device_sessions
        WHERE device_id = d.id
          AND status = 'online'
          AND started_at < ?
          AND (ended_at IS NULL OR ended_at > ?)
      ) AS online_minutes_30d
    FROM devices d
    ${whereClause}
    ORDER BY
      CASE WHEN COALESCE(d.name, '') = '' THEN d.mac_address ELSE d.name END COLLATE NOCASE ASC,
      d.id ASC
  `).all(
    nowIso,
    nowIso,
    todayStart,
    nowIso,
    todayStart,
    nowIso,
    nowIso,
    last7DaysStart,
    nowIso,
    last7DaysStart,
    nowIso,
    nowIso,
    last30DaysStart,
    nowIso,
    last30DaysStart,
    ...values,
  );
}

export function listVisibleDevices() {
  return listDeviceRows('WHERE d.is_visible = 1', []).map((row) => {
    const item = mapListRow(row);
    item.note = '';
    return item;
  });
}

export function listAllDevices() {
  return listDeviceRows('', []).map(mapListRow);
}

export function getDeviceById(deviceId: number) {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as DeviceRow | undefined;
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    macAddress: row.mac_address,
    ipAddress: row.ip_address,
    note: row.note,
    isVisible: Boolean(row.is_visible),
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDevice(input: DeviceInput) {
  const macAddress = normalizeMac(input.macAddress);
  const now = dayjs().toISOString();
  const result = db.prepare(`
    INSERT INTO devices (name, mac_address, ip_address, note, is_visible, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    (input.name ?? '').trim(),
    macAddress,
    (input.ipAddress ?? '').trim() || null,
    (input.note ?? '').trim(),
    input.isVisible === true ? 1 : 0,
    now,
    now,
  );
  return getDeviceById(Number(result.lastInsertRowid));
}

export function updateDevice(deviceId: number, input: DeviceUpdateInput) {
  const fields: string[] = [];
  const values: unknown[] = [];

  const assign = (column: string, value: unknown) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };

  if (typeof input.name === 'string') assign('name', input.name.trim());
  if (typeof input.note === 'string') assign('note', input.note.trim());
  if (typeof input.ipAddress === 'string') assign('ip_address', input.ipAddress.trim() || null);
  if (typeof input.isVisible === 'boolean') assign('is_visible', input.isVisible === false ? 0 : 1);
  if (typeof input.macAddress === 'string') assign('mac_address', normalizeMac(input.macAddress));

  if (fields.length === 0) {
    return getDeviceById(deviceId);
  }

  assign('updated_at', dayjs().toISOString());
  values.push(deviceId);

  db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDeviceById(deviceId);
}

export function deleteDevice(deviceId: number) {
  const result = db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
  if (result.changes === 0) {
    throw new Error('设备不存在');
  }
  // 级联删除相关的 sessions
  db.prepare('DELETE FROM device_sessions WHERE device_id = ?').run(deviceId);
}

export function upsertDeviceByMac(macAddressInput: string) {
  const macAddress = normalizeMac(macAddressInput);
  const existing = db
    .prepare('SELECT id FROM devices WHERE mac_address = ?')
    .get(macAddress) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const now = dayjs().toISOString();
  const result = db.prepare(`
    INSERT INTO devices (name, mac_address, ip_address, note, is_visible, created_at, updated_at)
    VALUES (?, ?, NULL, '', 0, ?, ?)
  `).run('', macAddress, now, now);

  return Number(result.lastInsertRowid);
}

export function recordPresenceForMacs(
  routerId: number,
  macAddresses: string[],
  observedAt: string,
  pollIntervalMinutes: number = 5,
  offlineDelayMinutes: number = OFFLINE_DELAY_MINUTES,
) {
  const uniqueMacs = Array.from(
    new Set(
      macAddresses
        .map((value) => safeNormalizeMac(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const observedTime = dayjs(observedAt);

  const insertSession = db.prepare(`
    INSERT INTO device_sessions (device_id, status, started_at, ended_at, duration_minutes)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateSession = db.prepare(`
    UPDATE device_sessions
    SET ended_at = ?, duration_minutes = ?
    WHERE id = ?
  `);
  const getLastSession = db.prepare(`
    SELECT id, status, started_at, ended_at
    FROM device_sessions
    WHERE device_id = ?
    ORDER BY started_at DESC
    LIMIT 1
  `);
  const getDeviceLastSeen = db.prepare(`
    SELECT last_seen_at FROM devices WHERE id = ?
  `);
  const updateDeviceState = db.prepare(`
    UPDATE devices
    SET last_seen_at = ?, updated_at = ?, is_online = ?, missed_count = ?
    WHERE id = ?
  `);
  const updateDeviceMissed = db.prepare(`
    UPDATE devices
    SET missed_count = ?, updated_at = ?
    WHERE id = ?
  `);

  const deviceIds = db.prepare('SELECT id FROM devices').all() as Array<{ id: number }>;
  const observedDeviceIds = new Set<number>();

  db.transaction(() => {
    uniqueMacs.forEach((macAddress) => {
      const deviceId = upsertDeviceByMac(macAddress);
      observedDeviceIds.add(deviceId);

      const deviceRow = getDeviceLastSeen.get(deviceId) as { last_seen_at: string | null } | undefined;
      const lastSeenAt = deviceRow?.last_seen_at;
      const now = observedAt;

      if (!lastSeenAt || dayjs(now).diff(dayjs(lastSeenAt), 'minute') >= offlineDelayMinutes) {
        // 新增记录，started_at、ended_at都是当前时间
        insertSession.run(deviceId, 'online', now, now, 0);
      } else {
        // 更新最近一条该设备sessions，将ended_at改为当前时间
        const lastSession = getLastSession.get(deviceId) as any;
        if (lastSession && lastSession.status === 'online') {
          const duration = Math.max(
            0,
            Math.round(dayjs(now).diff(dayjs(lastSession.started_at), 'minute', true)),
          );
          updateSession.run(now, duration, lastSession.id);
        } else {
          // 如果没有最近的在线session，创建新的
          insertSession.run(deviceId, 'online', now, now, 0);
        }
      }

      // 更新设备 last_seen_at
      updateDeviceState.run(now, now, 1, 0, deviceId);
    });

    // 对于未被采集到的设备，只更新 missed_count，不记录 offline sessions
    for (const { id: deviceId } of deviceIds) {
      if (observedDeviceIds.has(deviceId)) {
        continue;
      }

      const currentMissed = db.prepare(`
        SELECT missed_count FROM devices WHERE id = ?
      `).get(deviceId) as { missed_count: number };
      const newMissed = (currentMissed?.missed_count ?? 0) + 1;

      updateDeviceMissed.run(newMissed, observedAt, deviceId);
    }
  })();

  return uniqueMacs.length;
}

export function getDeviceTimeline(deviceId: number, range: '1d' | '7d', anchorDate?: string): DeviceTimelineResult | null {
  const exists = getDeviceById(deviceId);
  if (!exists) {
    return null;
  }

  const baseDay = anchorDate ? dayjs(anchorDate).startOf('day') : dayjs().startOf('day');
  const now = dayjs();

  const buildDaySegments = (dayStart: dayjs.Dayjs) => {
    const dayEnd = dayStart.add(1, 'day');
    const visibleEnd = dayStart.isSame(now, 'day')
      ? (now.isBefore(dayEnd) ? now : dayEnd)
      : (dayStart.isAfter(now) ? dayStart : dayEnd);

    const sessions = db.prepare(`
      SELECT started_at, ended_at, status
      FROM device_sessions
      WHERE device_id = ?
        AND started_at < ?
        AND (ended_at IS NULL OR ended_at > ?)
      ORDER BY started_at ASC
    `).all(deviceId, dayEnd.toISOString(), dayStart.toISOString()) as Array<{
      started_at: string;
      ended_at: string | null;
      status: string;
    }>;

    const segments: DeviceTimelineSegment[] = [];
    let cursor = dayStart;

    const pushSegment = (status: 'online' | 'offline' | 'pending', start: dayjs.Dayjs, end: dayjs.Dayjs) => {
      if (!end.isAfter(start)) {
        return;
      }

      const last = segments[segments.length - 1];
      const minutes = end.diff(start, 'minute');
      if (last && last.status === status && last.endAt === start.toISOString()) {
        last.endAt = end.toISOString();
        last.minutes += minutes;
        return;
      }

      segments.push({
        status,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        minutes,
        dayLabel: dayStart.format('MM-DD'),
      });
    };

    for (const session of sessions) {
      const sessionStartRaw = dayjs(session.started_at);
      const sessionEndRaw = session.ended_at ? dayjs(session.ended_at) : visibleEnd;
      const sessionStart = sessionStartRaw.isAfter(dayStart) ? sessionStartRaw : dayStart;
      const sessionEnd = sessionEndRaw.isBefore(dayEnd) ? sessionEndRaw : dayEnd;

      if (!sessionEnd.isAfter(dayStart) || !sessionStart.isBefore(dayEnd)) {
        continue;
      }

      if (cursor.isBefore(sessionStart)) {
        pushSegment('offline', cursor, sessionStart);
      }

      const normalizedStatus = session.status === 'online' ? 'online' : 'offline';
      pushSegment(normalizedStatus, sessionStart, sessionEnd);
      cursor = sessionEnd.isAfter(cursor) ? sessionEnd : cursor;
    }

    if (cursor.isBefore(visibleEnd)) {
      pushSegment('offline', cursor, visibleEnd);
      cursor = visibleEnd;
    }

    if (cursor.isBefore(dayEnd)) {
      pushSegment('pending', cursor, dayEnd);
    }

    return {
      label: dayStart.format('MM-DD'),
      onlineMinutes: segments
        .filter((segment) => segment.status === 'online')
        .reduce((sum, segment) => sum + segment.minutes, 0),
      segments,
      bucketStart: dayStart.toISOString(),
    };
  };

  if (range === '1d') {
    const day = buildDaySegments(baseDay);
    return {
      timeline: [{ bucketStart: day.bucketStart, label: baseDay.format('MM-DD'), onlineMinutes: day.onlineMinutes }],
      segments: day.segments,
    };
  }

  const days = Array.from({ length: 7 }, (_, index) => baseDay.subtract(6 - index, 'day'));
  const daily = days.map(buildDaySegments);

  return {
    timeline: daily.map((day) => ({
      bucketStart: day.bucketStart,
      label: day.label,
      onlineMinutes: day.onlineMinutes,
    })),
    segments: daily.flatMap((day) => day.segments),
  };
}
