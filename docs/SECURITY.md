# Security Architecture & Threat Controls

## Implemented Security Controls

| Control Area | Implementation Details | Verification Evidence |
|---|---|---|
| **Password Hashing** | `bcryptjs` with work factor `10` (`server/routes/auth.ts`). Password hashes are never selected or serialized into API responses. | Verified in `auth.test` login/register flow. |
| **Session & Token Auth** | HMAC-signed JWT Bearer tokens (`jsonwebtoken`, configurable expiry `12h`) + SHA-256 hashed programmatic `x-api-key` headers. | Verified in `tests/sortsight.test.ts`. |
| **RBAC Enforcement** | Backend middleware `requirePermission()` enforces role matrices (`admin`, `facility_manager`, `operator`, `reviewer`, `analyst`, `viewer`). | Tested: `operator` receives HTTP `403` on `/admin/api-keys`. |
| **Multi-Tenant Isolation** | `req.auth.organizationId` derives solely from verified JWT/API-key claims. Queries filter strictly on `organization_id = ?`. | Tested: Org B receives HTTP `400`/`404` probing Org A facilities and reviews. |
| **Encryption at Rest** | Webhook signing secrets use `AES-256-GCM` authenticated encryption (`encryptSecret` / `decryptSecret`) with random 12-byte IVs and auth tags. | Implemented in `server/db/database.ts`. |
| **Webhook Integrity** | Webhook test and event dispatches sign JSON payloads with HMAC-SHA256 (`signatureHeader: sha256=...`). | Verified in `tests/sortsight.test.ts`. |
| **Input & Upload Validation** | Strict regex & MIME allowlist (`image/jpeg|png|webp|gif`), `64 B` min size, `MAX_UPLOAD_BYTES` (`10 MB`) max limit, Express `12mb` JSON body cap. | Unit-tested in `validateImageInput`. |
| **HTTP Hardening & Rate Limits** | `helmet()` security headers, `cors()` origin restriction in production, and `express-rate-limit` on `/api/*`. | Active in `server.ts`. |
| **Server-Side AI Key Custody** | `GEMINI_API_KEY` stays strictly in `process.env` on Express backend; zero client SDK exposure or UI key prompts. | Verified across `src/` vs `server/`. |
| **Immutable Audit Trail** | Auth logins, facility creation, detections, policy updates, hazard actions, review overrides, key creation/revocation, and backups write to `audit_logs`. | Verified (`review.corrected` in audit logs). |
| **Privacy Controls** | Organizations configure `privacy_retention_days` and opt out of raw frame persistence (`store_detection_images = 0` / `storeHistory = false`). | Verified via batch `storeHistory: false` test & settings API. |

## Production Security Checklist

1. Replace development defaults by setting `JWT_SECRET` (>= 32 random chars) and `ENCRYPTION_KEY` (exactly 64 hex characters / 256-bit key).
2. Terminate TLS 1.3 at reverse proxy (`HTTPS` in transit) and restrict `APP_URL` to your exact deployment origin.
3. Rotate API keys periodically and revoke compromised keys via `DELETE /api/v1/admin/api-keys/:id`.
