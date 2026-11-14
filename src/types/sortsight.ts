export type ViewId =
  | 'landing'
  | 'product_overview'
  | 'auth'
  | 'onboarding'
  | 'dashboard'
  | 'scanner'
  | 'realtime'
  | 'batch'
  | 'materials'
  | 'contamination'
  | 'hazards'
  | 'sorting'
  | 'conveyor'
  | 'global_rules'
  | 'country_rules'
  | 'directory'
  | 'analytics'
  | 'environment'
  | 'assistant'
  | 'reviews'
  | 'annotations'
  | 'models'
  | 'datasets'
  | 'digital_twin'
  | 'simulator'
  | 'material_flow'
  | 'operations'
  | 'inventory'
  | 'batches'
  | 'team'
  | 'notifications'
  | 'developers'
  | 'security'
  | 'settings'
  | 'profile'
  | 'admin';

export type LanguageCode = 'en' | 'sv' | 'de' | 'es' | 'ja';

export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  preferredLanguage: LanguageCode;
  avatarInitials: string;
  organizationId: string;
  organizationName: string;
  roleName: string;
  assignedFacilityId: string | null;
  permissions: string[];
}

export interface Facility {
  id: string;
  organization_id: string;
  name: string;
  facility_code: string;
  facility_type: string;
  country_code: string;
  region: string;
  city: string;
  capacity_tons_per_day: number;
  status: 'active' | 'maintenance' | 'offline';
  is_demo_data: number;
  organization_name?: string;
}

export interface DetectedObjectItem {
  id: string;
  trackId: string;
  label: string;
  materialCode: string;
  fineGrainedType: string;
  confidence: number;
  calibratedConfidence: number;
  isLowConfidence: boolean;
  isUnknownMaterial: boolean;
  bbox: [number, number, number, number];
  segmentationPolygon: Array<[number, number]>;
  explanation: string;
  visualCues: string[];
  recyclableStatus: 'recyclable' | 'conditional' | 'non_recyclable' | 'hazardous' | 'unknown';
  recyclabilityReason: string;
  reusePotential: string;
  packagingType: string;
  isMultilayer: boolean;
  separationAdvice: string;
  readinessScore: number;
  recoveryScore: number;
  sortingPriority: number;
  recommendedChute: string;
  contamination: {
    hasContamination: boolean;
    contaminationType: string;
    severity: 'none' | 'low' | 'moderate' | 'high' | 'critical';
    purityEstimatePct: number;
    foodResidueDetected: boolean;
    crossMaterialDetected: boolean;
    description: string;
    remediationAction: string;
  };
  hazard: {
    isHazardous: boolean;
    hazardType: string | null;
    severity: 'medium' | 'high' | 'critical' | null;
    warningMessage: string;
    isolationRecommendation: string;
    safeHandlingGuidance: string;
  };
}

export interface VisionPipelineResult {
  detectionRecordId: string;
  facilityId: string;
  imageName: string;
  sourceType: string;
  inferenceProvider: 'gemini-4-hydrogen' | 'edge_heuristic_fallback';
  isFallbackMode: boolean;
  fallbackReason?: string;
  inferenceLatencyMs: number;
  overallReadinessScore: number;
  overallRecoveryScore: number;
  hasHazards: boolean;
  needsHumanReview: boolean;
  storeHistory: boolean;
  visualInspectionDisclaimer: string;
  policyApplied: {
    id: string;
    title: string;
    origin: string;
    sourceAttribution: string;
  } | null;
  objects: DetectedObjectItem[];
}

export interface FeatureDefinition {
  id: number;
  category: string;
  name: string;
  description: string;
  uiLocation: string;
  apiEndpoint: string;
  dbTables: string[];
  externalBoundary: string | null;
  status: string;
}

export type TimeRangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface SavedDashboardView {
  id: string;
  name: string;
  description: string;
  config: {
    facilityId?: string;
    timeRange?: TimeRangePreset;
    startDate?: string;
    endDate?: string;
    focusArea?: string;
  };
  is_shared: number;
  is_demo_data: number;
  creator_name?: string;
  created_at: string;
}

export interface AnomalyInsight {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'contamination_spike' | 'recovery_drop' | 'hazard_surge' | 'review_backlog' | 'low_confidence_surge';
  title: string;
  facilityId: string | null;
  facilityName: string;
  observedValue: string;
  baselineValue: string;
  explanation: string;
  recommendedAction: string;
  detectedAt: string;
  methodologyNote: string;
}

export interface GlobalSearchResult {
  id: string;
  entityType: 'facility' | 'material' | 'detection' | 'hazard' | 'review' | 'batch' | 'policy';
  title: string;
  subtitle: string;
  targetView: ViewId;
  targetPath?: string;
  badge: string;
  severity?: string;
}

export interface ShiftHandoverRecord {
  id: string;
  facility_id: string;
  facility_name: string;
  shift_label: string;
  outgoing_user_name: string;
  incoming_user_name: string;
  summary_notes: string;
  safety_notes: string;
  conveyor_status_snapshot: string;
  open_hazards_count: number;
  pending_reviews_count: number;
  items_processed_count: number;
  status: 'draft' | 'submitted' | 'acknowledged';
  signed_off_by_name?: string | null;
  signed_off_at?: string | null;
  is_demo_data: number;
  created_at: string;
}

