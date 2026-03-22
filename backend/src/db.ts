import fs from 'node:fs';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH, DEFAULT_ARP_MAC_OID } from './config.js';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 161,
      snmp_version TEXT NOT NULL DEFAULT '2c',
      community TEXT NOT NULL,
      arp_mac_oid TEXT NOT NULL DEFAULT '${DEFAULT_ARP_MAC_OID}',
      poll_interval_minutes INTEGER NOT NULL DEFAULT 5,
      offline_delay_count INTEGER NOT NULL DEFAULT 2,
      offline_delay_minutes INTEGER NOT NULL DEFAULT 10,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_polled_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      mac_address TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      note TEXT NOT NULL DEFAULT '',
      is_visible INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT,
      is_online INTEGER NOT NULL DEFAULT 0,
      missed_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('online', 'offline')),
      event_at TEXT NOT NULL,
      FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('online', 'offline')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes INTEGER,
      FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      router_id INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      observed_bucket TEXT NOT NULL,
      FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY(router_id) REFERENCES routers(id) ON DELETE CASCADE,
      UNIQUE(device_id, observed_bucket)
    );

    CREATE INDEX IF NOT EXISTS idx_devices_visible ON devices(is_visible);
    CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_device_time ON device_sessions(device_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_observations_device_time ON device_observations(device_id, observed_at);
    CREATE INDEX IF NOT EXISTS idx_observations_bucket ON device_observations(observed_bucket);
  `);

  applyMigrations();
}

function applyMigrations() {
  try {
    db.prepare(
      `ALTER TABLE routers ADD COLUMN arp_mac_oid TEXT NOT NULL DEFAULT '${DEFAULT_ARP_MAC_OID}'`,
    ).run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare(`ALTER TABLE device_sessions ADD COLUMN duration_minutes INTEGER`).run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare(`ALTER TABLE routers ADD COLUMN offline_delay_count INTEGER NOT NULL DEFAULT 2`).run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare(`ALTER TABLE routers ADD COLUMN offline_delay_minutes INTEGER NOT NULL DEFAULT 10`).run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare("ALTER TABLE devices ADD COLUMN note TEXT NOT NULL DEFAULT ''").run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare("ALTER TABLE devices ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 0").run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare("ALTER TABLE devices ADD COLUMN ip_address TEXT").run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare("ALTER TABLE devices ADD COLUMN is_online INTEGER NOT NULL DEFAULT 0").run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.prepare("ALTER TABLE devices ADD COLUMN missed_count INTEGER NOT NULL DEFAULT 0").run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('online', 'offline')),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_device_time ON device_sessions(device_id, started_at);
    `);
  } catch (error) {
    throw error;
  }
}
