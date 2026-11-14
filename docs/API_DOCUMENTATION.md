# API Documentation

All API endpoints are versioned under `/api/v1` and exposed via interactive OpenAPI 3.0 JSON at `GET /api/v1/openapi.json`.

## Authentication & Headers

- **JWT Session**: `Authorization: Bearer <jwt>`
- **Programmatic API Key**: `x-api-key: ss_live_<hex>` (verified via SHA-256 hash lookup in `api_keys`)
- **Rate Limiting**: Express rate limiter enforced on `/api/*` (`RATE_LIMIT_MAX_REQUESTS`, default `300` / `15m`).

## Endpoint Reference

### Auth, Users & Organizations (`server/routes/auth.ts`)
- `GET /api/v1/auth/demo-accounts` — Public demo persona list (no hashes/secrets).
- `POST /api/v1/auth/login` — Verifies bcrypt hash and returns signed JWT + permissions.
- `POST /api/v1/auth/register` — Creates user, isolated organization, primary facility, starter sorting rule, and starter twin.
- `GET /api/v1/auth/me` — Returns current user session and tenant settings.
- `PUT /api/v1/users/me/preferences` — Updates name and UI language (`en`, `sv`, `de`, `es`, `ja`).
- `GET /api/v1/organizations/current` / `PUT /api/v1/organizations/current` — Manage tenant retention & `store_detection_images`.
- `POST /api/v1/organizations` — Provisions additional organization for authenticated user.
- `GET /api/v1/organizations/members` / `POST` / `PUT .../members/:id` — Manage team members & 6-role RBAC assignments.
- `GET /api/v1/facilities` / `POST /api/v1/facilities` — Tenant-scoped facility management.
- `GET /api/v1/facilities/directory` — Public searchable directory (`?q=...&country=SE`).

### Computer Vision, Policies, Contamination & Hazards (`server/routes/detection.ts`)
- `POST /api/v1/detection/analyze` — Runs 12-stage vision pipeline on base64 image (`cloud_gemini` or `offline_edge`).
- `POST /api/v1/detection/video-frames` — Analyzes up to 6 key video frames with persistent `TRK-*` IDs.
- `POST /api/v1/detection/batch` — Batch inspection up to 10 images with aggregated readiness/recovery metrics.
- `GET /api/v1/detection/history` — Paginated (`limit`, `offset`), searchable scan history.
- `GET /api/v1/materials/taxonomy` — Lists 19 global material categories & environmental factors.
- `GET /api/v1/recycling/policies` / `POST /api/v1/recycling/policies` — Manage scoped policies.
- `PUT /api/v1/recycling/rules/:id` — Update material acceptance thresholds & target chutes.
- `POST /api/v1/recycling/compatibility-check` — Evaluates item material + contamination against a selected policy.
- `GET /api/v1/recycling/regional-summary` — Compares regional policy acceptance counts.
- `GET /api/v1/contamination` — Facility-filtered contamination events.
- `GET /api/v1/hazards` — Lists visual hazard alerts alongside mandatory non-chemical disclaimer.
- `POST /api/v1/hazards/:id/status` — Updates hazard status (`acknowledged`, `isolated`, `resolved`, `escalated`).

### Smart Sorting, Conveyor & Industrial Simulators (`server/routes/sorting.ts`)
- `GET /api/v1/sorting/config` / `PUT /api/v1/sorting/config` — Configure auto-sort confidence & max contamination.
- `GET /api/v1/sorting/decisions` / `GET /api/v1/sorting/metrics` — Routing logs & review-verified sorting accuracy.
- `GET /api/v1/conveyor/sessions` / `POST /api/v1/conveyor/session` / `POST /api/v1/conveyor/tick` — Conveyor simulator controls.
- `GET /api/v1/integrations/devices` — Lists camera, PLC, and robotic adapters with explicit `SIMULATOR` notice.
- `POST /api/v1/integrations/plc-command` — Generates simulated OPC-UA/Modbus coil dispatch event.
- `POST /api/v1/integrations/robotic-pick` — Computes normalized mm pick coordinates in simulator mode.
- `POST /api/v1/integrations/test-device` — Runs adapter simulator heartbeat.

### Analytics, Environment & AI Assistant (`server/routes/analytics.ts`)
- `GET /api/v1/analytics/overview` — Composition, contamination breakdown, live operational counters (`openHazardsCount`, `pendingReviewsCount`, `verifiedAccuracyPct`), conveyor/twin/environmental summaries, and time-windowed snapshots (`today`, `7d`, `30d`, `90d`, `custom`).
- `GET /api/v1/analytics/anomalies` — Deterministic threshold and rolling-baseline operational anomaly insights.
- `GET /api/v1/analytics/dashboard-views` / `POST` / `DELETE .../:id` — Persisted shared/personal dashboard filter presets.
- `GET /api/v1/analytics/facilities-compare` — Multi-facility benchmarking inside active org.
- `GET /api/v1/analytics/export-csv` — Downloads CSV detection report (`sortsight_analytics_export.csv`).
- `GET /api/v1/environment/estimates` / `POST /api/v1/environment/estimate` — Computes modeled CO2e/energy/landfill impact.
- `POST /api/v1/assistant/query` — Context-grounded natural-language operator query (`gemini-4-hydrogen` + `grounded_rule_fallback`).

### Human-in-the-Loop, Datasets & Model Governance (`server/routes/reviewsModels.ts`)
- `GET /api/v1/reviews` / `POST /api/v1/reviews/:id/resolve` / `POST /api/v1/reviews/:id/promote-dataset`
- `GET /api/v1/reviews/errors` — Recurring predicted-vs-corrected confusion pairs.
- `GET /api/v1/annotations` / `POST /api/v1/annotations` — Manage verified bounding-box annotations.
- `GET /api/v1/datasets` / `POST /api/v1/datasets` — Dataset versioning registry.
- `GET /api/v1/models` / `POST /api/v1/models/training-jobs` / `POST /api/v1/models/versions/:id/approve`
- `GET /api/v1/models/drift` / `GET /api/v1/models/telemetry` — Live class distribution & latency telemetry.

### Operations, Digital Twin, Search, Alerts & Admin (`server/routes/operationsAdmin.ts`)
- `GET /api/v1/search` — Org-isolated global search across facilities, materials, detections, hazards, reviews, batches, and policies (`recent_searches` history).
- `GET /api/v1/operations/overview` / `POST /api/v1/operations/batches` / `PATCH /api/v1/operations/batches/:id`
- `GET /api/v1/operations/handovers` / `POST /api/v1/operations/handovers` / `PATCH /api/v1/operations/handovers/:id/signoff` — Shift handover logs with live operational snapshots and supervisor sign-off.
- `POST /api/v1/operations/tasks` / `PATCH /api/v1/operations/tasks/:id`
- `GET /api/v1/inventory` / `POST /api/v1/inventory`
- `GET /api/v1/digital-twin` / `GET /api/v1/digital-twin/flow` / `POST /api/v1/simulations/run`
- `GET /api/v1/notifications` / `POST /api/v1/notifications/group-or-create` / `POST .../acknowledge` / `POST .../resolve` / `PATCH .../assign` / `POST /api/v1/notifications/test-email`
- `GET /api/v1/webhooks` / `POST /api/v1/webhooks` / `POST /api/v1/webhooks/:id/test`
- `GET /api/v1/admin/api-keys` / `POST /api/v1/admin/api-keys` / `DELETE /api/v1/admin/api-keys/:id`
- `GET /api/v1/admin/audit-logs` / `GET /api/v1/admin/backup` / `POST /api/v1/admin/import-policies`
- `GET /api/v1/features` / `GET /api/v1/health` / `GET /api/v1/openapi.json`
