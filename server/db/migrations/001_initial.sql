PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1. Organizations & Multi-Tenancy
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT 'US',
  region TEXT NOT NULL DEFAULT 'North America',
  industry_type TEXT NOT NULL DEFAULT 'MRF Operator',
  privacy_retention_days INTEGER NOT NULL DEFAULT 365,
  store_detection_images INTEGER NOT NULL DEFAULT 1,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  avatar_initials TEXT NOT NULL DEFAULT 'SS',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Roles & Permissions
CREATE TABLE IF NOT EXISTS roles_permissions (
  role_name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  permissions_json TEXT NOT NULL
);

-- 4. Organization Memberships
CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL REFERENCES roles_permissions(role_name),
  assigned_facility_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, user_id)
);

-- 5. Facilities
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  facility_code TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT 'Material Recovery Facility',
  country_code TEXT NOT NULL,
  region TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  capacity_tons_per_day REAL NOT NULL DEFAULT 120,
  is_public_directory INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'offline')),
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Material Categories (Global Standard Taxonomy)
CREATE TABLE IF NOT EXISTS material_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_group TEXT NOT NULL,
  resin_or_standard_code TEXT NOT NULL,
  eu_low_code TEXT NOT NULL,
  hazard_class TEXT NOT NULL DEFAULT 'none' CHECK (hazard_class IN ('none', 'low', 'moderate', 'high', 'critical')),
  default_recyclable INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  co2_saved_kg_per_kg REAL NOT NULL DEFAULT 1.5,
  energy_saved_kwh_per_kg REAL NOT NULL DEFAULT 3.2,
  landfill_diverted_m3_per_kg REAL NOT NULL DEFAULT 0.002
);

-- 7. Recycling Policies (Country / Region / Facility)
CREATE TABLE IF NOT EXISTS recycling_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
  scope_level TEXT NOT NULL CHECK (scope_level IN ('global', 'country', 'region', 'facility')),
  country_code TEXT NOT NULL,
  region_name TEXT NOT NULL,
  title TEXT NOT NULL,
  policy_origin TEXT NOT NULL CHECK (policy_origin IN ('reference_standard', 'admin_sample_policy', 'facility_custom')),
  source_attribution TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  localized_instructions_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Material Acceptance Rules
CREATE TABLE IF NOT EXISTS material_acceptance_rules (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES recycling_policies(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL REFERENCES material_categories(code),
  accepted INTEGER NOT NULL DEFAULT 1,
  max_contamination_pct REAL NOT NULL DEFAULT 5.0,
  requires_separation INTEGER NOT NULL DEFAULT 0,
  target_bin TEXT NOT NULL,
  condition_notes TEXT NOT NULL,
  guidance_text TEXT NOT NULL
);

-- 9. AI Models & Model Versions
CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  architecture TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('gemini_cloud', 'edge_heuristic', 'onnx_adapter', 'yolo_reference')),
  license TEXT NOT NULL,
  origin_source TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  version_tag TEXT NOT NULL,
  dataset_id TEXT,
  training_mode TEXT NOT NULL DEFAULT 'pretrained' CHECK (training_mode IN ('pretrained', 'transfer_learning', 'domain_adaptation', 'fine_tuned')),
  status TEXT NOT NULL DEFAULT 'evaluated' CHECK (status IN ('draft', 'training', 'evaluated', 'staging', 'production', 'archived')),
  precision_score REAL,
  recall_score REAL,
  f1_score REAL,
  calibration_ece REAL,
  avg_latency_ms REAL,
  confusion_matrix_json TEXT NOT NULL DEFAULT '{}',
  class_metrics_json TEXT NOT NULL DEFAULT '[]',
  edge_compatible INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Datasets & Annotations
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version_tag TEXT NOT NULL,
  license TEXT NOT NULL,
  provenance_url TEXT NOT NULL,
  split_strategy TEXT NOT NULL DEFAULT '70/15/15 stratified',
  sample_count INTEGER NOT NULL DEFAULT 0,
  class_distribution_json TEXT NOT NULL DEFAULT '{}',
  limitations_notes TEXT NOT NULL DEFAULT '',
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dataset_annotations (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  detection_record_id TEXT,
  image_label TEXT NOT NULL,
  bbox_json TEXT NOT NULL,
  material_code TEXT NOT NULL,
  contamination_flags_json TEXT NOT NULL DEFAULT '[]',
  annotator_user_id TEXT REFERENCES users(id),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. Detection Records & Objects
CREATE TABLE IF NOT EXISTS detection_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  batch_id TEXT,
  conveyor_session_id TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'camera', 'video_frame', 'batch', 'conveyor_sim', 'offline_edge')),
  image_name TEXT NOT NULL,
  image_data_url TEXT,
  inference_provider TEXT NOT NULL,
  model_version_id TEXT REFERENCES model_versions(id),
  inference_latency_ms INTEGER NOT NULL DEFAULT 0,
  overall_readiness_score REAL NOT NULL DEFAULT 0,
  overall_recovery_score REAL NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0,
  has_hazards INTEGER NOT NULL DEFAULT 0,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  store_history INTEGER NOT NULL DEFAULT 1,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS detection_objects (
  id TEXT PRIMARY KEY,
  detection_record_id TEXT NOT NULL REFERENCES detection_records(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  track_id TEXT,
  label TEXT NOT NULL,
  material_code TEXT NOT NULL,
  fine_grained_type TEXT NOT NULL,
  confidence REAL NOT NULL,
  calibrated_confidence REAL NOT NULL,
  is_low_confidence INTEGER NOT NULL DEFAULT 0,
  is_unknown_material INTEGER NOT NULL DEFAULT 0,
  bbox_json TEXT NOT NULL,
  segmentation_polygon_json TEXT NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL,
  visual_cues_json TEXT NOT NULL DEFAULT '[]',
  recyclable_status TEXT NOT NULL CHECK (recyclable_status IN ('recyclable', 'conditional', 'non_recyclable', 'hazardous', 'unknown')),
  recyclability_reason TEXT NOT NULL,
  reuse_potential TEXT NOT NULL DEFAULT 'low',
  packaging_type TEXT NOT NULL DEFAULT 'single_material',
  is_multilayer INTEGER NOT NULL DEFAULT 0,
  separation_advice TEXT NOT NULL DEFAULT '',
  readiness_score REAL NOT NULL DEFAULT 0,
  recovery_score REAL NOT NULL DEFAULT 0,
  sorting_priority INTEGER NOT NULL DEFAULT 3,
  recommended_chute TEXT NOT NULL DEFAULT 'manual_qc',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. Contamination Records & Hazard Alerts
CREATE TABLE IF NOT EXISTS contamination_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  detection_record_id TEXT NOT NULL REFERENCES detection_records(id) ON DELETE CASCADE,
  detection_object_id TEXT REFERENCES detection_objects(id) ON DELETE CASCADE,
  contamination_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('none', 'low', 'moderate', 'high', 'critical')),
  purity_estimate_pct REAL NOT NULL DEFAULT 100,
  food_residue_detected INTEGER NOT NULL DEFAULT 0,
  cross_material_detected INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  remediation_action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hazard_alerts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  detection_record_id TEXT REFERENCES detection_records(id) ON DELETE SET NULL,
  detection_object_id TEXT REFERENCES detection_objects(id) ON DELETE SET NULL,
  hazard_type TEXT NOT NULL CHECK (hazard_type IN ('lithium_battery', 'battery', 'e_waste', 'chemical_container', 'medical_waste', 'sharp_object', 'pressurized_vessel', 'unknown_hazard')),
  severity TEXT NOT NULL CHECK (severity IN ('medium', 'high', 'critical')),
  title TEXT NOT NULL,
  warning_message TEXT NOT NULL,
  isolation_recommendation TEXT NOT NULL,
  safe_handling_guidance TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'isolated', 'resolved', 'escalated')),
  acknowledged_by TEXT REFERENCES users(id),
  acknowledged_at TEXT,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. Human-in-the-Loop Reviews & Error Tracking
CREATE TABLE IF NOT EXISTS human_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  detection_record_id TEXT NOT NULL REFERENCES detection_records(id) ON DELETE CASCADE,
  detection_object_id TEXT REFERENCES detection_objects(id) ON DELETE CASCADE,
  trigger_reason TEXT NOT NULL,
  original_material_code TEXT NOT NULL,
  original_confidence REAL NOT NULL,
  corrected_material_code TEXT,
  corrected_recyclable_status TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'verified_correct', 'corrected', 'escalated_expert', 'added_to_dataset')),
  reviewer_user_id TEXT REFERENCES users(id),
  reviewer_notes TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. Smart Sorting Configurations, Conveyor Sessions, Decisions
CREATE TABLE IF NOT EXISTS sorting_configurations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  min_confidence_auto_sort REAL NOT NULL DEFAULT 0.72,
  max_contamination_pct REAL NOT NULL DEFAULT 12.0,
  rules_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conveyor_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  line_name TEXT NOT NULL,
  belt_speed_mps REAL NOT NULL DEFAULT 1.8,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running', 'paused', 'idle', 'emergency_stop')),
  mode TEXT NOT NULL DEFAULT 'simulator' CHECK (mode IN ('simulator', 'hardware_adapter')),
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_diverted_reject INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS sorting_decisions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  detection_record_id TEXT REFERENCES detection_records(id) ON DELETE SET NULL,
  conveyor_session_id TEXT REFERENCES conveyor_sessions(id) ON DELETE SET NULL,
  material_code TEXT NOT NULL,
  confidence REAL NOT NULL,
  assigned_chute TEXT NOT NULL,
  is_rejection_stream INTEGER NOT NULL DEFAULT 0,
  decision_reason TEXT NOT NULL,
  plc_command_payload_json TEXT NOT NULL DEFAULT '{}',
  executed_status TEXT NOT NULL DEFAULT 'simulated' CHECK (executed_status IN ('simulated', 'dispatched', 'verified', 'overridden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. Operations: Processing Batches, Material Inventory, Tasks, Alerts
CREATE TABLE IF NOT EXISTS processing_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  batch_code TEXT NOT NULL,
  source_route TEXT NOT NULL,
  intake_weight_kg REAL NOT NULL,
  recovered_weight_kg REAL NOT NULL DEFAULT 0,
  contaminated_weight_kg REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'intake' CHECK (status IN ('intake', 'sorting', 'completed', 'quarantined')),
  assigned_operator_id TEXT REFERENCES users(id),
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS material_inventory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL REFERENCES material_categories(code),
  bale_count INTEGER NOT NULL DEFAULT 0,
  weight_kg REAL NOT NULL DEFAULT 0,
  avg_purity_pct REAL NOT NULL DEFAULT 95.0,
  storage_zone TEXT NOT NULL DEFAULT 'Bay A',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(facility_id, material_code)
);

CREATE TABLE IF NOT EXISTS operations_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed')),
  assigned_to_user_id TEXT REFERENCES users(id),
  created_by_user_id TEXT REFERENCES users(id),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 16. Environmental Impact Assumptions & Snapshots
CREATE TABLE IF NOT EXISTS environmental_estimates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  measured_recovered_kg REAL NOT NULL,
  modeled_co2_avoided_kg REAL NOT NULL,
  modeled_energy_saved_kwh REAL NOT NULL,
  modeled_landfill_diverted_m3 REAL NOT NULL,
  methodology_notes TEXT NOT NULL,
  assumptions_json TEXT NOT NULL,
  is_modeled_estimate INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  total_items_scanned INTEGER NOT NULL,
  recovery_rate_pct REAL NOT NULL,
  contamination_rate_pct REAL NOT NULL,
  sorting_accuracy_pct REAL NOT NULL,
  throughput_tons REAL NOT NULL,
  is_demo_data INTEGER NOT NULL DEFAULT 0
);

-- 17. Digital Twin & Optimization Simulations
CREATE TABLE IF NOT EXISTS digital_twin_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stages_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS simulation_scenarios (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  twin_config_id TEXT REFERENCES digital_twin_configs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  results_json TEXT NOT NULL,
  assumptions_text TEXT NOT NULL,
  is_simulation INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18. Security, Notifications, API Keys, Webhooks, Integrations, Audit
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email_simulated', 'webhook')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '["read","detect"]',
  created_by TEXT REFERENCES users(id),
  last_used_at TEXT,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  events_json TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  signature_header TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  http_status INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integration_devices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('plc_controller', 'robotic_arm', 'industrial_camera', 'edge_jetson', 'optical_nir')),
  protocol TEXT NOT NULL,
  endpoint_uri TEXT NOT NULL,
  connection_mode TEXT NOT NULL DEFAULT 'simulator' CHECK (connection_mode IN ('simulator', 'configured_offline')),
  last_heartbeat_at TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES integration_devices(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for query performance and tenant isolation
CREATE INDEX IF NOT EXISTS idx_facilities_org ON facilities(organization_id);
CREATE INDEX IF NOT EXISTS idx_detections_org_fac ON detection_records(organization_id, facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_det_objects_record ON detection_objects(detection_record_id);
CREATE INDEX IF NOT EXISTS idx_det_objects_material ON detection_objects(organization_id, material_code);
CREATE INDEX IF NOT EXISTS idx_hazards_org_status ON hazard_alerts(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_org_status ON human_reviews(organization_id, review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sorting_dec_org ON sorting_decisions(organization_id, facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_org ON processing_batches(organization_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id, is_read, created_at DESC);
