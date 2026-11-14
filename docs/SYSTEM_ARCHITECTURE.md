# System Architecture

## Architectural Adaptation Note

The application runs on **Node.js + Express + TypeScript + Vite (`server.ts` on port `3000`)** backed by **SQLite (`better-sqlite3`)** with normalized relational migrations, foreign keys, WAL concurrency, and migration tracking. Docker Compose persists this same SQLite database in a named volume. PostgreSQL is not currently connected to the application.

## Layer Overview

| Layer | Modules | Responsibilities |
|---|---|---|
| **Presentation (SPA)** | `src/App.tsx`, `src/components/*`, `src/views/*`, `src/lib/*` | 36 interface areas, SVG/Canvas overlays, Recharts visualizations, jsPDF report generation, RBAC navigation gating, i18n (`en`/`sv`/`de`/`es`/`ja`) |
| **HTTP Security & Gateway** | `server.ts`, `server/middleware/auth.ts`, `server/config.ts` | Helmet headers, CORS policy, `/api` rate limiting (12MB JSON body cap), JWT & `x-api-key` auth, permission checks, tenant isolation, audit trail |
| **API Route Modules** | `server/routes/auth.ts`, `detection.ts`, `sorting.ts`, `analytics.ts`, `reviewsModels.ts`, `operationsAdmin.ts` | Versioned `/api/v1/*` REST contracts covering auth, vision, policies, sorting, analytics, assistant, QA, MLOps, twin simulations, ops, and admin |
| **Domain & AI Services** | `server/services/visionPipeline.ts`, `assistantService.ts`, `simulationService.ts`, `featureRegistry.ts` | 12-stage CV inference & policy evaluation, confidence calibration, offline edge heuristics, grounded assistant, 7-stage MRF twin physics, 154-feature registry |
| **Persistence & Crypto** | `server/db/database.ts`, `migrations/001_initial.sql`, `seed.ts` | 35 tables (`better-sqlite3`), AES-256-GCM secret encryption, core role/material reference seeding plus development/test demo seeding (`is_demo_data = 1`; demo data disabled in production by default) |

## 36 Application Interface Areas

1. Public Landing Page (`LandingPage`)
2. Product Overview (`product_overview`)
3. Authentication (`AuthView` login)
4. Organization Onboarding (`AuthView` onboarding)
5. Main Dashboard (`dashboard`)
6. Smart Waste Scanner (`scanner`)
7. Real-Time Detection Studio (`realtime`)
8. Batch Analysis (`batch`)
9. Material Intelligence Center (`materials`)
10. Contamination Analysis (`contamination`)
11. Hazard Intelligence Center (`hazards`)
12. Smart Sorting Control Center (`sorting`)
13. Conveyor Monitoring (`conveyor`)
14. Global Recycling Intelligence (`global_rules`)
15. Country & Region Rules (`country_rules`)
16. Facility Directory (`directory`)
17. Analytics Center (`analytics`)
18. Environmental Impact Estimator (`environment`)
19. AI Assistant (`assistant`)
20. Human Review Center (`reviews`)
21. Annotation Workspace (`annotations`)
22. Model Management (`models`)
23. Dataset Management (`datasets`)
24. Digital Twin (`digital_twin`)
25. Optimization Simulator (`simulator`)
26. Material Flow Explorer (`material_flow`)
27. Facility Operations (`operations`)
28. Inventory Management (`inventory`)
29. Collection Batch Management (`batches`)
30. Team Management (`team`)
31. Notifications (`notifications`)
32. API & Developer Center (`developers`)
33. Security & Audit Center (`security`)
34. Organization Settings (`settings`)
35. User Profile (`profile`)
36. Admin Control Panel (`admin`)

## Data Flow & Provenance Separation

Every data path separates:
- **Measured User Outcomes** (`is_demo_data = 0`)
- **Seeded Demonstration Fixtures** (`is_demo_data = 1`)
- **Simulated Industrial Payloads** (`mode = 'simulator'`, `executed_status = 'simulated'`)
- **Modeled Environmental & Twin Projections** (`is_modeled_estimate = 1`, `is_simulation = 1`)
