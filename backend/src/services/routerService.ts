import dayjs from 'dayjs';
import { db } from '../db.js';
import { DEFAULT_ARP_MAC_OID } from '../config.js';

export interface RouterRecord {
  id: number;
  name: string;
  host: string;
  port: number;
  snmpVersion: '1' | '2c' | 'mock';
  community: string;
  arpMacOid: string;
  pollIntervalMinutes: number;
  offlineDelayCount: number;
  offlineDelayMinutes: number;
  isActive: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RouterInput {
  name: string;
  host: string;
  port: number;
  snmpVersion: '1' | '2c' | 'mock';
  community: string;
  arpMacOid?: string;
  pollIntervalMinutes?: number;
  offlineDelayCount?: number;
  offlineDelayMinutes?: number;
  isActive?: boolean;
}

export interface RouterUpdateInput extends Partial<RouterInput> {}

interface RouterRow {
  id: number;
  name: string;
  host: string;
  port: number;
  snmp_version: '1' | '2c' | 'mock';
  community: string;
  arp_mac_oid: string;
  poll_interval_minutes: number;
  offline_delay_count: number;
  offline_delay_minutes: number;
  is_active: number;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function mapRouter(row: RouterRow): RouterRecord {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    snmpVersion: row.snmp_version,
    community: row.community,
    arpMacOid: row.arp_mac_oid,
    pollIntervalMinutes: row.poll_interval_minutes,
    offlineDelayCount: row.offline_delay_count,
    offlineDelayMinutes: row.offline_delay_minutes,
    isActive: Boolean(row.is_active),
    lastPolledAt: row.last_polled_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizePollInterval(value: number | undefined) {
  const parsed = Number(value ?? 5);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5;
  }
  return Math.max(Math.floor(parsed), 1);
}

function sanitizeDelayCount(value: number | undefined) {
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 2;
  }
  return Math.max(Math.floor(parsed), 1);
}

function sanitizeDelayMinutes(value: number | undefined) {
  const parsed = Number(value ?? 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.max(Math.floor(parsed), 1);
}

export function listRouters() {
  return db
    .prepare('SELECT * FROM routers ORDER BY id ASC')
    .all()
    .map((row) => mapRouter(row as RouterRow));
}

export function getRouterById(routerId: number) {
  const row = db.prepare('SELECT * FROM routers WHERE id = ?').get(routerId) as RouterRow | undefined;
  return row ? mapRouter(row) : null;
}

export function createRouter(input: RouterInput) {
  const now = dayjs().toISOString();
  const result = db.prepare(`
    INSERT INTO routers (
      name, host, port, snmp_version, community, arp_mac_oid,
      poll_interval_minutes, offline_delay_count, offline_delay_minutes, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name.trim(),
    input.host.trim(),
    input.port,
    input.snmpVersion,
    input.community.trim(),
    input.arpMacOid?.trim() || DEFAULT_ARP_MAC_OID,
    sanitizePollInterval(input.pollIntervalMinutes),
    sanitizeDelayCount(input.offlineDelayCount),
    sanitizeDelayMinutes(input.offlineDelayMinutes),
    input.isActive === false ? 0 : 1,
    now,
    now,
  );

  return getRouterById(Number(result.lastInsertRowid))!;
}

export function updateRouter(routerId: number, input: RouterUpdateInput) {
  const fields: string[] = [];
  const values: unknown[] = [];

  const assign = (column: string, value: unknown) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };

  if (typeof input.name === 'string') assign('name', input.name.trim());
  if (typeof input.host === 'string') assign('host', input.host.trim());
  if (typeof input.port === 'number') assign('port', input.port);
  if (typeof input.snmpVersion === 'string') assign('snmp_version', input.snmpVersion);
  if (typeof input.community === 'string') assign('community', input.community.trim());
  if (typeof input.arpMacOid === 'string') assign('arp_mac_oid', input.arpMacOid.trim() || DEFAULT_ARP_MAC_OID);
  if (typeof input.pollIntervalMinutes === 'number') {
    assign('poll_interval_minutes', sanitizePollInterval(input.pollIntervalMinutes));
  }
  if (typeof input.offlineDelayCount === 'number') {
    assign('offline_delay_count', sanitizeDelayCount(input.offlineDelayCount));
  }
  if (typeof input.offlineDelayMinutes === 'number') {
    assign('offline_delay_minutes', sanitizeDelayMinutes(input.offlineDelayMinutes));
  }
  if (typeof input.isActive === 'boolean') assign('is_active', input.isActive ? 1 : 0);

  if (fields.length === 0) {
    return getRouterById(routerId);
  }

  assign('updated_at', dayjs().toISOString());
  values.push(routerId);
  db.prepare(`UPDATE routers SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getRouterById(routerId);
}

export function deleteRouter(routerId: number) {
  db.prepare('DELETE FROM routers WHERE id = ?').run(routerId);
}

export function getDueRouters(reference = dayjs()) {
  return listRouters().filter((router) => {
    if (!router.isActive) return false;
    if (!router.lastPolledAt) return true;
    return reference.diff(dayjs(router.lastPolledAt), 'minute', true) >= router.pollIntervalMinutes;
  });
}

export function markRouterPollSuccess(routerId: number, polledAt: string) {
  db.prepare(`
    UPDATE routers
    SET last_polled_at = ?, last_error = NULL, updated_at = ?
    WHERE id = ?
  `).run(polledAt, polledAt, routerId);
}

export function markRouterPollError(routerId: number, polledAt: string, errorMessage: string) {
  db.prepare(`
    UPDATE routers
    SET last_polled_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(polledAt, errorMessage, polledAt, routerId);
}
