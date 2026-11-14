import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const isProduction = nodeEnv === 'production';
const configuredJwtSecret = process.env.JWT_SECRET?.trim() || '';
const configuredEncryptionKey = process.env.ENCRYPTION_KEY?.trim() || '';

if (configuredJwtSecret && configuredJwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters. Generate one with: openssl rand -hex 32');
}
if (configuredEncryptionKey && !/^[a-fA-F0-9]{64}$/.test(configuredEncryptionKey)) {
  throw new Error('ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes). Generate one with: openssl rand -hex 32');
}
if (isProduction && !configuredJwtSecret) {
  throw new Error('Production startup blocked: set a strong JWT_SECRET in the environment.');
}
if (isProduction && !configuredEncryptionKey) {
  throw new Error('Production startup blocked: set ENCRYPTION_KEY to 64 hexadecimal characters in the environment.');
}

// Ephemeral secrets are convenient for local development and tests only.
// Production explicitly requires stable secrets so sessions and encrypted values survive restarts.
const jwtSecret = configuredJwtSecret || crypto.randomBytes(32).toString('hex');
const encryptionKeyHex = configuredEncryptionKey || crypto.randomBytes(32).toString('hex');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

export const config = {
  port,
  nodeEnv,
  appUrl: process.env.APP_URL?.trim() || 'http://localhost:3000',
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
  jwtSecret,
  encryptionKeyHex,
  databasePath: process.env.DATABASE_PATH || './data/sortsight.db',
  seedDemoData: process.env.SEED_DEMO_DATA === 'true' || !isProduction,
  maxUploadBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
  rateLimitWindowMs: 60 * 1000,
  rateLimitMaxRequests: 240,
  lowConfidenceThreshold: 0.65,
  smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
  plcGatewayMode: process.env.PLC_GATEWAY_MODE || 'simulator',
};
