# Deployment Guide

## Option 1 — Standard Node.js Full-Stack Deployment (AI Studio / VM / Cloud Run)

1. **Install Dependencies**:
   ```bash
   npm install --no-audit --no-fund
   ```
2. **Configure Environment**:
   Copy `.env.example` to `.env` and populate production secrets:
   - `NODE_ENV=production`
   - `PORT=3000`
   - `APP_URL=https://your-domain.example`
   - `JWT_SECRET=<strong-random-string>`
   - `ENCRYPTION_KEY=<64-hex-characters>`
   - `GEMINI_API_KEY=<server-side-gemini-key>` (optional; falls back cleanly to offline edge mode)
   - `DATABASE_PATH=./data/sortsight.db`
   - `SEED_DEMO_DATA=false` (demo fixtures are disabled automatically in production)
3. **Build Production Frontend Bundle**:
   ```bash
   npm run build
   ```
   Compiles Vite React assets into `dist/`.
4. **Start Production Server**:
   ```bash
   npm start
   ```
   Serves both `/api/v1/*` and the compiled `dist/index.html` SPA on port `3000`.
5. **Verify Readiness**:
   ```bash
   curl -sf http://localhost:3000/api/v1/health
   ```

## Option 2 — Containerized Deployment (`Docker` & `docker-compose.yml`)

The repository includes a multi-stage `Dockerfile` and a Compose service for the application. The production container uses the existing SQLite database with a persistent Docker volume; it does not require PostgreSQL.

Create a `.env` file with generated secrets (run these commands in your shell):

```bash
cat > .env <<EOF
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
APP_URL=http://localhost:3000
EOF
```

For a public deployment, replace `APP_URL` with the exact HTTPS origin before starting the container.

Then run:

```bash
docker compose up --build -d
docker compose logs -f sortsight-web
```

The container runs as a non-root user and exposes a health check at `/api/v1/health`. The SQLite database is stored in the named `sortsight_data` volume. Keep the JWT and encryption secrets stable across restarts and backups; changing the encryption key makes existing encrypted webhook secrets unreadable.

## Backup & Restore Procedures

- **Tenant Export**: Administrators can export JSON organizational snapshots (org metadata, facilities, policies, detections metadata, batches, inventory) via `GET /api/v1/admin/backup`.
- **SQLite File Snapshot**: Because SQLite runs in WAL mode (`data/sortsight.db`), use SQLite online backup or a checkpoint before copying database files to cold object storage. Back up the encryption key separately and securely.
