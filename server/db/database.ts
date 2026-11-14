import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { config } from '../config.ts';

let dbInstance: Database.Database | null = null;

export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) return dbInstance;

  const targetPath = customPath || config.databasePath;
  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function resetDbForTests(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  dbInstance = db;
}

function runMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(process.cwd(), 'server/db/migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations')
    .all() as Array<{ version: string }>;
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  for (const fileName of migrationFiles) {
    const version = fileName.replace(/\.sql$/, '');
    if (appliedSet.has(version)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
  }
}

// AES-256-GCM Encryption at rest for sensitive integration secrets / keys
export function encryptSecret(plaintext: string): string {
  const key = Buffer.from(config.encryptionKeyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted payload format');
  const key = Buffer.from(config.encryptionKeyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
