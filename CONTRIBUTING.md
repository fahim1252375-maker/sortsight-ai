# Contributing to SortSight AI

Thank you for contributing to SortSight AI. Please uphold the platform's engineering, scientific honesty, and security standards on every pull request.

## Development Workflow

1. Inspect `server/services/featureRegistry.ts` and `docs/FEATURE_IMPLEMENTATION_MATRIX.md` before modifying existing capabilities so all 154 requirement IDs remain traceable.
2. Create a focused feature branch and keep backend routes modular under `server/routes/`.
3. Preserve strict multi-tenant isolation (`WHERE organization_id = ?` scoped from `req.auth.organizationId`, never trusting client-supplied org IDs).
4. Keep `@google/genai` calls strictly server-side; never expose API keys, secrets, or password hashes to client bundles.

## Required Checks Before Opening a PR

Run all three verification commands locally:

```bash
npm run lint
npm test
npm run build
```

## Engineering Integrity Rules

- Never fabricate model accuracy numbers, carbon credits, or live PLC hardware connections.
- Clearly distinguish `is_demo_data = 1` records, `is_modeled_estimate = 1` lifecycle outputs, `isSimulation = true` digital twin scenarios, and `SIMULATOR` industrial device payloads.
- Add or update Vitest coverage in `tests/sortsight.test.ts` whenever adding an endpoint or modifying authorization logic.
- Update the matching documentation file under `docs/` when database tables, API contracts, or model parameters change.
