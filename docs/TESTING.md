# Testing & Quality Assurance

## Automated Test Architecture (`tests/sortsight.test.ts`)

SortSight AI uses **Vitest** running against the real Express app (`createApp()`) wired to an isolated in-memory SQLite database initialized via `resetDbForTests(new Database(':memory:'))`.

### Test Categories Covered

1. **Feature Registry Completeness & AI Units**:
   - Validates all `154` feature IDs (`1..154`) exist with zero duplicates or gaps.
   - Validates base64 image MIME allowlisting, min/max size enforcement, and invalid input rejection.
   - Verifies temperature-scaled confidence calibration ($T = 1.18$).
   - Verifies 7-stage Digital Twin simulation math & explicit `isSimulation: true` marking.
2. **Health, OpenAPI & Metadata Endpoints**:
   - Exercises `/api/v1/health`, `/api/v1/openapi.json`, and `/api/v1/features`.
3. **15-Step End-to-End Platform Journey**:
   - Registers Org A user -> provisions org -> creates MRF facility -> analyzes waste frame (`offline_edge`) -> triggers hazard alert & human review -> runs batch & video frame tracking -> validates policies, compatibility checker & public directory -> runs conveyor simulator ticks & updates sorting config -> queries analytics & environmental estimator -> exports CSV report -> resolves human review correction -> promotes correction to versioned dataset -> verifies `review.corrected` in audit logs -> verifies batch/inventory/simulation/webhook/backup flows.
4. **Security, RBAC & Multi-Tenant Isolation**:
   - Confirms cross-tenant probes from Org B against Org A facilities/reviews fail (`400`/`404`).
   - Confirms `operator` role receives `403 Forbidden` attempting admin API key creation.
   - Confirms `x-api-key` authentication and offline `grounded_rule_fallback` assistant execution.

## Execution Commands & Latest Results

- **Type Checking**: `npm run lint` (`tsc --noEmit`) — Passed (0 errors)
- **Automated Tests**: `npm test` (`vitest run`) — Passed (**16/16 tests** in `tests/sortsight.test.ts`)
- **Production Build**: `npm run build` (`vite build`) — Verified cleanly
- **CI Workflow**: Automated lint, test, and build checks configured in `.github/workflows/ci.yml`.
