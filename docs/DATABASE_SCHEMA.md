# Database Schema

Defined in `server/db/migrations/001_initial.sql` and `server/db/migrations/002_enterprise_features.sql`, managed by `server/db/database.ts` with `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`.

## Schema Summary (38 Tables)

### Tenancy, Identity & RBAC
1. `schema_migrations` — Tracks applied SQL migration versions (`001_initial`, `002_enterprise_features`).
2. `organizations` — Multi-tenant root entities, country/region, retention days, `store_detection_images` privacy flag.
3. `users` — User credentials (bcrypt hash), display metadata, `preferred_language`, `is_demo_data`.
4. `roles_permissions` — JSON permission arrays for 6 roles (`admin`, `facility_manager`, `operator`, `reviewer`, `analyst`, `viewer`).
5. `organization_memberships` — Links `users` to `organizations`, roles, and optional `assigned_facility_id` (`UNIQUE(organization_id, user_id)`).
6. `facilities` — Facility registry with capacity, public directory flag (`is_public_directory`), and `organization_id` FK.

### Global Materials & Recycling Policy Engine
7. `material_categories` — 19 canonical waste classes (`PET_01`..`UNKNOWN_OOD`), ISO 14021 / RIC / Basel codes, default CO2/energy/landfill factors.
8. `recycling_policies` — Scoped policies (`global`, `country`, `region`, `facility`) with `policy_origin` (`verified_reference`, `admin_sample_policy`, `facility_custom`), `source_attribution`, `effective_date`, and localized instructions JSON.
9. `material_acceptance_rules` — Per-policy acceptance flags, `max_contamination_pct`, `target_bin`, and guidance text (`UNIQUE(policy_id, material_code)`).

### Computer Vision, Contamination & Hazard Persistence
10. `ai_models` — Registered detection architectures (`cloud_vision` / `edge_cv`).
11. `model_versions` — Version lifecycle (`staging`, `evaluated`, `production`, `archived`), precision/recall/F1, `ece_score`, `confusion_matrix_json`, `approved_by`.
12. `datasets` — Active-learning & benchmark datasets with license, provenance URL, split strategy, and limitation notes.
13. `dataset_annotations` — Human-verified bounding boxes and labels promoted from reviews or created in Annotation Workspace.
14. `detection_records` — Parent scan record storing `inference_provider`, `inference_latency_ms`, scores, `has_hazards`, `needs_human_review`, optional `image_data_url`, and `is_demo_data`.
15. `detection_objects` — Per-item bounding box `[ymin,xmin,ymax,xmax]`, polygon mask JSON, `raw_confidence`, `calibrated_confidence`, `recyclable_status`, `readiness_score`, `recovery_score`, `recommended_chute`, and explanation.
16. `contamination_records` — Surface purity estimate, contamination type, severity (`none`..`critical`), food/cross-material booleans, and remediation action.
17. `hazard_alerts` — Visual hazard escalation alerts with `status` (`open`, `acknowledged`, `isolated`, `resolved`, `escalated`) and isolation guidance.
18. `human_reviews` — QA escalation queue recording `original_material_code`, `corrected_material_code`, `reviewer_user_id`, and `reviewed_at`.

### Smart Sorting & Conveyor Simulation
19. `sorting_configurations` — Facility thresholds (`min_confidence_auto_sort`, `max_contamination_pct`) and chute rule JSON.
20. `conveyor_sessions` — Line belt speed, status (`running`, `paused`, `emergency_stop`), counters, and `mode` (`simulator`).
21. `sorting_decisions` — Per-object routing decisions, rejection flag, and simulated PLC payload JSON.

### Facility Operations & Traceability
22. `processing_batches` — Collection route weights (intake, recovered, contaminated) and batch status (`intake`..`completed`).
23. `material_inventory` — Facility bale counts, kg stock, purity % (`UNIQUE(facility_id, material_code)`).
24. `operations_tasks` — Facility operator tasks with priority and completion state.

### Analytics, Environment & Digital Twin
25. `environmental_estimates` — Measured recovery weights + modeled CO2e/kWh/landfill displacement (`is_modeled_estimate = 1`).
26. `analytics_snapshots` — Daily time-series KPIs with `is_demo_data` isolation flag.
27. `digital_twin_configs` — Facility 7-stage line capacity & recovery configuration.
28. `simulation_scenarios` — Saved what-if parameters, outputs, and `is_simulation = 1`.

### Notifications, Developer Integrations, Enterprise Operations & Security
29. `notifications` — In-app and simulated email alert inbox with `status` (`open`, `acknowledged`, `resolved`), `facility_id`, `assigned_to_user_id`, `group_key`, `occurrence_count`, and acknowledgement/resolution audit timestamps.
30. `api_keys` — Prefixed SHA-256 hashed API keys with scope arrays and revocation flags.
31. `webhooks` — Event subscriptions with AES-256-GCM `encrypted_secret`.
32. `webhook_deliveries` — HMAC-SHA256 signed delivery attempt logs.
33. `integration_devices` — Registered camera, PLC, and robotic arm adapters (`connection_mode = 'simulator'`).
34. `integration_events` — Simulated command/pick/heartbeat payloads.
35. `audit_logs` — Append-only security & operational event log.
36. `saved_dashboard_views` — Organization/user persisted dashboard filter presets (`facilityId`, `timeRange`, custom dates).
37. `shift_handovers` — Operational shift handover logs capturing live facility snapshots (`conveyor_status_snapshot`, `open_hazards_count`, `pending_reviews_count`), safety notes, and supervisor sign-off.
38. `recent_searches` — Per-user, org-isolated global search query history.

## Indexing & Tenant Isolation Strategy

- High-frequency query paths carry explicit indexes (`idx_det_org_fac`, `idx_det_obj_mat`, `idx_haz_org_status`, `idx_rev_org_status`, `idx_audit_org_date`, `idx_snap_org_date`, `idx_apikey_hash`, `idx_handover_org_fac`, `idx_notif_org_status`).
- Every multi-tenant table binds `organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`.
