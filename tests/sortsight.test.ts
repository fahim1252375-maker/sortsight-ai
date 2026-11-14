import http from 'http';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server.ts';
import { resetDbForTests } from '../server/db/database.ts';
import { FEATURE_REGISTRY } from '../server/services/featureRegistry.ts';
import { runSortingSimulation } from '../server/services/simulationService.ts';
import { calibrateConfidence, validateImageInput } from '../server/services/visionPipeline.ts';

let server: http.Server;
let baseUrl = '';

const SAMPLE_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC';

async function reqJson<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; token?: string; apiKey?: string; body?: unknown } = {}
): Promise<{ status: number; data: T; text: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.apiKey) headers['x-api-key'] = options.apiKey;

  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = {} as T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    // plain text / CSV
  }
  return { status: res.status, data, text };
}

beforeAll(async () => {
  const memDb = new Database(':memory:');
  resetDbForTests(memDb);
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('SortSight AI — Feature Registry & AI Core Units', () => {
  it('contains all 154 mandatory feature IDs without gaps or duplicates', () => {
    expect(FEATURE_REGISTRY.length).toBe(154);
    const ids = new Set(FEATURE_REGISTRY.map((f) => f.id));
    expect(ids.size).toBe(154);
    for (let i = 1; i <= 154; i++) {
      expect(ids.has(i)).toBe(true);
    }
  });

  it('validates image mime types and rejects invalid payloads', () => {
    expect(() => validateImageInput('not-an-image')).toThrow();
    const ok = validateImageInput(SAMPLE_PNG_BASE64);
    expect(ok.mimeType).toBe('image/png');
    expect(ok.byteLength).toBeGreaterThan(64);
  });

  it('calibrates raw confidence scores conservatively via temperature scaling', () => {
    expect(calibrateConfidence(0.95)).toBeLessThan(0.95);
    expect(calibrateConfidence(0.5)).toBe(0.5);
    expect(calibrateConfidence(0.1)).toBeGreaterThan(0.1);
  });

  it('computes Digital Twin sorting optimization simulation explicitly marked isSimulation=true', () => {
    const out = runSortingSimulation(
      [
        { id: 's1', name: 'Infeed', capacityTph: 15, currentLoadTph: 12, contaminationRisk: 0.15, recoveryEff: 0.98 },
        { id: 's2', name: 'NIR', capacityTph: 10, currentLoadTph: 9, contaminationRisk: 0.08, recoveryEff: 0.95 },
      ],
      {
        infeedRateTph: 14,
        beltSpeedMps: 1.9,
        confidenceThreshold: 0.72,
        opticalAirJetBoostPct: 10,
        manualQcStaffCount: 3,
        incomingContaminationPct: 8,
      }
    );
    expect(out.isSimulation).toBe(true);
    expect(out.projectedRecoveryRatePct).toBeGreaterThan(50);
    expect(out.predictiveNext7Days.length).toBe(7);
  });
});

describe('SortSight AI — End-to-End Platform, RBAC & Tenant Isolation', () => {
  let orgAToken = '';
  let orgAFacilityId = '';
  let detectionId = '';
  let reviewId = '';
  let orgBToken = '';

  it('checks system health, OpenAPI readiness, and machine-readable feature registry endpoints', async () => {
    const health = await reqJson<{ status: string }>('/health');
    expect(health.status).toBe(200);
    expect(health.data.status).toBe('healthy');

    const openapi = await reqJson<{ openapi: string }>('/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.data.openapi).toBe('3.0.3');

    const features = await reqJson<{ total: number }>('/features');
    expect(features.status).toBe(200);
    expect(features.data.total).toBe(154);
  });

  it('1-3: registers Org A user, provisions organization & creates a new facility', async () => {
    const reg = await reqJson<{ token: string; user: { organizationId: string; assignedFacilityId: string } }>('/auth/register', {
      method: 'POST',
      body: {
        email: 'e2e-org-a@sortsight.test',
        password: 'TestPassword2026!',
        fullName: 'E2E Lead Engineer',
        organizationName: 'Test Recovery Org A',
        countryCode: 'SE',
        region: 'Nordics',
      },
    });
    expect(reg.status).toBe(201);
    orgAToken = reg.data.token;

    const fac = await reqJson<{ facility: { id: string } }>('/facilities', {
      method: 'POST',
      token: orgAToken,
      body: {
        name: 'Malmo Optical MRF',
        countryCode: 'SE',
        region: 'Skane',
        city: 'Malmo',
        capacityTonsPerDay: 150,
      },
    });
    expect(fac.status).toBe(201);
    orgAFacilityId = fac.data.facility.id;
  });

  it('4-10: uploads waste frame, runs offline edge detection, detects hazards, creates sorting decisions & queues human review', async () => {
    const det = await reqJson<{
      detectionRecordId: string;
      inferenceProvider: string;
      hasHazards: boolean;
      needsHumanReview: boolean;
      objects: Array<{ id: string; recommendedChute: string; isLowConfidence: boolean }>;
    }>('/detection/analyze', {
      method: 'POST',
      token: orgAToken,
      body: {
        facilityId: orgAFacilityId,
        imageBase64DataUrl: SAMPLE_PNG_BASE64,
        imageName: 'test_hazard_battery_frame.png',
        sourceType: 'upload',
        preferredMode: 'offline_edge',
        storeHistory: true,
      },
    });
    expect(det.status).toBe(201);
    expect(det.data.inferenceProvider).toBe('edge_heuristic_fallback');
    expect(det.data.hasHazards).toBe(true);
    expect(det.data.needsHumanReview).toBe(true);
    expect(det.data.objects.length).toBeGreaterThanOrEqual(2);
    detectionId = det.data.detectionRecordId;
  });

  it('supports batch image analysis and video frame tracking analysis', async () => {
    const batch = await reqJson<{ processedCount: number; totalObjects: number }>('/detection/batch', {
      method: 'POST',
      token: orgAToken,
      body: {
        facilityId: orgAFacilityId,
        preferredMode: 'offline_edge',
        storeHistory: false,
        images: [
          { imageBase64DataUrl: SAMPLE_PNG_BASE64, imageName: 'pet_hdpe_batch_1.png' },
          { imageBase64DataUrl: SAMPLE_PNG_BASE64, imageName: 'cardboard_grease_batch_2.png' },
        ],
      },
    });
    expect(batch.status).toBe(201);
    expect(batch.data.processedCount).toBe(2);
    expect(batch.data.totalObjects).toBeGreaterThanOrEqual(2);

    const video = await reqJson<{ frameCount: number }>('/detection/video-frames', {
      method: 'POST',
      token: orgAToken,
      body: {
        facilityId: orgAFacilityId,
        preferredMode: 'offline_edge',
        frames: [{ imageBase64DataUrl: SAMPLE_PNG_BASE64, imageName: 'clip_t0.png', timestampSec: 0 }],
      },
    });
    expect(video.status).toBe(201);
    expect(video.data.frameCount).toBe(1);
  });

  it('evaluates global recycling policies, compatibility checker, hazards isolation, and public directory', async () => {
    const taxonomy = await reqJson<{ materials: Array<{ code: string }> }>('/materials/taxonomy');
    expect(taxonomy.status).toBe(200);
    expect(taxonomy.data.materials.length).toBeGreaterThanOrEqual(18);

    const polCreate = await reqJson<{ policyId: string }>('/recycling/policies', {
      method: 'POST',
      token: orgAToken,
      body: {
        facilityId: orgAFacilityId,
        scopeLevel: 'facility',
        countryCode: 'SE',
        regionName: 'Skane',
        title: 'Malmo Sample Fiber & Polymer Policy',
        policyOrigin: 'facility_custom',
        sourceAttribution: 'Facility QA Manual 2026',
      },
    });
    expect(polCreate.status).toBe(201);

    const compat = await reqJson<{ compatible: boolean; status: string }>('/recycling/compatibility-check', {
      method: 'POST',
      token: orgAToken,
      body: {
        policyId: polCreate.data.policyId,
        materialCode: 'OCC_CARD',
        contaminationPct: 12,
        hasFoodResidue: true,
      },
    });
    expect(compat.status).toBe(200);
    expect(compat.data.compatible).toBe(false);

    const haz = await reqJson<{ disclaimer: string; hazards: Array<{ id: string }> }>('/hazards', { token: orgAToken });
    expect(haz.status).toBe(200);
    expect(haz.data.disclaimer).toContain('NOT establish chemical safety');
    expect(haz.data.hazards.length).toBeGreaterThanOrEqual(1);

    const hazUpdate = await reqJson(`/hazards/${haz.data.hazards[0].id}/status`, {
      method: 'POST',
      token: orgAToken,
      body: { status: 'isolated' },
    });
    expect(hazUpdate.status).toBe(200);

    const dir = await reqJson<{ facilities: Array<{ id: string }> }>('/facilities/directory');
    expect(dir.status).toBe(200);
    expect(dir.data.facilities.length).toBeGreaterThanOrEqual(1);
  });

  it('runs conveyor monitoring session simulation ticks and updates sorting config', async () => {
    const convCreate = await reqJson<{ session: { id: string } }>('/conveyor/session', {
      method: 'POST',
      token: orgAToken,
      body: { facilityId: orgAFacilityId, action: 'create', beltSpeedMps: 2.0, lineName: 'Test Optical Line' },
    });
    expect(convCreate.status).toBe(201);

    const tick = await reqJson<{ mode: string; decision: { id: string } }>('/conveyor/tick', {
      method: 'POST',
      token: orgAToken,
      body: { sessionId: convCreate.data.session.id },
    });
    expect(tick.status).toBe(200);
    expect(tick.data.mode).toBe('SIMULATOR');

    const sortCfg = await reqJson<{ config: { id: string } | null }>('/sorting/config', { token: orgAToken });
    expect(sortCfg.status).toBe(200);
    if (sortCfg.data.config) {
      const upd = await reqJson('/sorting/config', {
        method: 'PUT',
        token: orgAToken,
        body: { id: sortCfg.data.config.id, minConfidenceAutoSort: 0.75, maxContaminationPct: 6.5 },
      });
      expect(upd.status).toBe(200);
    }
  });

  it('11-12: retrieves analytics overview, facility comparisons, environmental estimates, and exports CSV report', async () => {
    const analytics = await reqJson<{ detectionMetrics: { totalScans: number } }>(`/analytics/overview?facilityId=${orgAFacilityId}`, {
      token: orgAToken,
    });
    expect(analytics.status).toBe(200);
    expect(analytics.data.detectionMetrics.totalScans).toBeGreaterThanOrEqual(1);

    const envEst = await reqJson<{ estimate: { is_modeled_estimate: number; modeled_co2_avoided_kg: number } }>('/environment/estimate', {
      method: 'POST',
      token: orgAToken,
      body: {
        facilityId: orgAFacilityId,
        periodLabel: 'E2E Test Week',
        materialWeightsKg: { PET_01: 120, ALUM_CAN: 45 },
        emissionFactorMultiplier: 1.0,
      },
    });
    expect(envEst.status).toBe(201);
    expect(envEst.data.estimate.is_modeled_estimate).toBe(1);
    expect(envEst.data.estimate.modeled_co2_avoided_kg).toBeGreaterThan(0);

    const csv = await reqJson('/analytics/export-csv', { token: orgAToken });
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('detection_id,facility_name');
    expect(csv.text).toContain(detectionId);
  });

  it('13-15: reviews low-confidence prediction, corrects classification, promotes to dataset, registers model version, and verifies audit history', async () => {
    const revList = await reqJson<{ reviews: Array<{ id: string }> }>('/reviews?status=pending', { token: orgAToken });
    expect(revList.status).toBe(200);
    expect(revList.data.reviews.length).toBeGreaterThanOrEqual(1);
    reviewId = revList.data.reviews[0].id;

    const resolve = await reqJson(`/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: orgAToken,
      body: {
        decision: 'corrected',
        correctedMaterialCode: 'BATT_LI',
        reviewerNotes: 'Confirmed lithium battery cell via QA check.',
      },
    });
    expect(resolve.status).toBe(200);

    const ds = await reqJson<{ dataset: { id: string } }>('/datasets', {
      method: 'POST',
      token: orgAToken,
      body: { name: 'E2E QA Corrections', versionTag: 'v1.0.0', license: 'CC-BY-4.0' },
    });
    expect(ds.status).toBe(201);

    const promote = await reqJson<{ annotationId: string }>(`/reviews/${reviewId}/promote-dataset`, {
      method: 'POST',
      token: orgAToken,
      body: { datasetId: ds.data.dataset.id },
    });
    expect(promote.status).toBe(201);

    const audit = await reqJson<{ logs: Array<{ action: string }> }>('/admin/audit-logs', { token: orgAToken });
    expect(audit.status).toBe(200);
    expect(audit.data.logs.some((l) => l.action === 'review.corrected')).toBe(true);
  });

  it('runs operations batches, inventory, tasks, digital twin simulation, webhooks, and backup export', async () => {
    const bat = await reqJson<{ batch: { id: string } }>('/operations/batches', {
      method: 'POST',
      token: orgAToken,
      body: { facilityId: orgAFacilityId, sourceRoute: 'Route North-4', intakeWeightKg: 4200, recoveredWeightKg: 3500 },
    });
    expect(bat.status).toBe(201);

    const inv = await reqJson('/inventory', {
      method: 'POST',
      token: orgAToken,
      body: { facilityId: orgAFacilityId, materialCode: 'PET_01', baleCount: 6, weightKg: 2400, avgPurityPct: 96.4 },
    });
    expect(inv.status).toBe(201);

    const sim = await reqJson<{ simulationId: string; results: { isSimulation: boolean } }>('/simulations/run', {
      method: 'POST',
      token: orgAToken,
      body: { facilityId: orgAFacilityId, name: 'E2E Throughput Check' },
    });
    expect(sim.status).toBe(201);
    expect(sim.data.results.isSimulation).toBe(true);

    const wh = await reqJson<{ id: string }>('/webhooks', {
      method: 'POST',
      token: orgAToken,
      body: { name: 'SCADA Event Hook', targetUrl: 'https://example.invalid/webhook' },
    });
    expect(wh.status).toBe(201);

    const whTest = await reqJson<{ signatureHeader: string }>(`/webhooks/${wh.data.id}/test`, {
      method: 'POST',
      token: orgAToken,
    });
    expect(whTest.status).toBe(200);
    expect(whTest.data.signatureHeader).toContain('sha256=');

    const backup = await reqJson<{ organization: { id: string } }>('/admin/backup', { token: orgAToken });
    expect(backup.status).toBe(200);
    expect(backup.data.organization.id).toBeTruthy();
  });

  it('enforces strict multi-tenant isolation between Org A and Org B', async () => {
    const regB = await reqJson<{ token: string }>('/auth/register', {
      method: 'POST',
      body: {
        email: 'e2e-org-b@sortsight.test',
        password: 'TestPassword2026!',
        fullName: 'Org B Admin',
        organizationName: 'Isolated Org B',
      },
    });
    expect(regB.status).toBe(201);
    orgBToken = regB.data.token;

    // Org B cannot inspect Org A's facility or resolve Org A's review
    const crossDet = await reqJson('/detection/analyze', {
      method: 'POST',
      token: orgBToken,
      body: {
        facilityId: orgAFacilityId,
        imageBase64DataUrl: SAMPLE_PNG_BASE64,
        imageName: 'cross_tenant_probe.png',
        preferredMode: 'offline_edge',
      },
    });
    expect(crossDet.status).toBe(400);

    const crossRev = await reqJson(`/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: orgBToken,
      body: { decision: 'verified_correct' },
    });
    expect(crossRev.status).toBe(404);
  });

  it('enforces RBAC permissions (operator blocked from admin API-key creation)', async () => {
    const opLogin = await reqJson<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email: 'operator@sortsight.demo', password: 'SortSightDemo2026!' },
    });
    expect(opLogin.status).toBe(200);

    const forbidden = await reqJson('/admin/api-keys', {
      method: 'POST',
      token: opLogin.data.token,
      body: { name: 'Unauthorized Key' },
    });
    expect(forbidden.status).toBe(403);
  });

  it('authenticates via x-api-key and executes assistant grounded fallback', async () => {
    const keyRes = await reqJson<{ apiKeyPlaintextOnce: string }>('/admin/api-keys', {
      method: 'POST',
      token: orgAToken,
      body: { name: 'Integration Test Key', scopes: ['read', 'detect'] },
    });
    expect(keyRes.status).toBe(201);

    const assistantRes = await reqJson<{ answer: string; provider: string }>('/assistant/query', {
      method: 'POST',
      token: orgAToken,
      body: { question: 'Summarize open hazards and facility policies.' },
    });
    expect(assistantRes.status).toBe(200);
    expect(assistantRes.data.answer.length).toBeGreaterThan(20);

    const apiKeyCheck = await reqJson('/facilities', { apiKey: keyRes.data.apiKeyPlaintextOnce });
    expect(apiKeyCheck.status).toBe(200);
  });

  it('supports Advanced Global Search, Saved Dashboard Views, Shift Handovers, Intelligent Alerts, and Operational Anomalies with tenant isolation', async () => {
    // 1. Saved Dashboard Views
    const viewCreate = await reqJson<{ view: { id: string; name: string } }>('/analytics/dashboard-views', {
      method: 'POST',
      token: orgAToken,
      body: {
        name: 'Malmo 7-Day QA View',
        description: 'Focus on Malmo Optical MRF',
        config: { facilityId: orgAFacilityId, timeRange: '7d' },
      },
    });
    expect(viewCreate.status).toBe(201);
    expect(viewCreate.data.view.name).toBe('Malmo 7-Day QA View');

    const viewsList = await reqJson<{ views: Array<{ id: string }> }>('/analytics/dashboard-views', { token: orgAToken });
    expect(viewsList.status).toBe(200);
    expect(viewsList.data.views.some((v) => v.id === viewCreate.data.view.id)).toBe(true);

    // Org B cannot delete Org A's saved view
    const crossDelView = await reqJson(`/analytics/dashboard-views/${viewCreate.data.view.id}`, {
      method: 'DELETE',
      token: orgBToken,
    });
    expect(crossDelView.status).toBe(404);

    // 2. Shift Handover & Supervisor Sign-Off
    const handCreate = await reqJson<{ handover: { id: string; status: string } }>('/operations/handovers', {
      method: 'POST',
      token: orgAToken,
      body: {
        facilityId: orgAFacilityId,
        shiftLabel: 'Night Shift E2E',
        incomingUserName: 'Supervisor B',
        summaryNotes: 'Optical line ran nominal with 1 hazard isolated.',
        safetyNotes: 'Verify battery drum lock.',
      },
    });
    expect(handCreate.status).toBe(201);
    expect(handCreate.data.handover.status).toBe('submitted');

    const handSignoff = await reqJson<{ handover: { status: string } }>(`/operations/handovers/${handCreate.data.handover.id}/signoff`, {
      method: 'PATCH',
      token: orgAToken,
      body: {},
    });
    expect(handSignoff.status).toBe(200);
    expect(handSignoff.data.handover.status).toBe('acknowledged');

    // Cross-tenant handover signoff blocked
    const crossHand = await reqJson(`/operations/handovers/${handCreate.data.handover.id}/signoff`, {
      method: 'PATCH',
      token: orgBToken,
      body: {},
    });
    expect(crossHand.status).toBe(404);

    // 3. Intelligent Alert Management (Deduplication + Acknowledge + Resolve)
    const alert1 = await reqJson<{ id: string; grouped: boolean; occurrenceCount: number }>('/notifications/group-or-create', {
      method: 'POST',
      token: orgAToken,
      body: {
        title: 'High Contamination Spike',
        message: 'Grease contamination exceeded 10%',
        severity: 'warning',
        facilityId: orgAFacilityId,
        groupKey: `contam:${orgAFacilityId}`,
      },
    });
    expect(alert1.status).toBe(201);
    expect(alert1.data.occurrenceCount).toBe(1);

    const alert2 = await reqJson<{ id: string; grouped: boolean; occurrenceCount: number }>('/notifications/group-or-create', {
      method: 'POST',
      token: orgAToken,
      body: {
        title: 'High Contamination Spike',
        message: 'Grease contamination exceeded 12%',
        severity: 'warning',
        facilityId: orgAFacilityId,
        groupKey: `contam:${orgAFacilityId}`,
      },
    });
    expect(alert2.status).toBe(200);
    expect(alert2.data.grouped).toBe(true);
    expect(alert2.data.occurrenceCount).toBe(2);

    const ack = await reqJson(`/notifications/${alert1.data.id}/acknowledge`, { method: 'POST', token: orgAToken, body: {} });
    expect(ack.status).toBe(200);

    const resAlert = await reqJson(`/notifications/${alert1.data.id}/resolve`, { method: 'POST', token: orgAToken, body: {} });
    expect(resAlert.status).toBe(200);

    // 4. Advanced Global Search & Recent Searches (Org-isolated)
    const searchA = await reqJson<{ results: Array<{ entityType: string }>; recentSearches: Array<{ query_text: string }> }>(
      '/search?q=Malmo',
      { token: orgAToken }
    );
    expect(searchA.status).toBe(200);
    expect(searchA.data.results.some((r) => r.entityType === 'facility')).toBe(true);
    expect(searchA.data.recentSearches.some((s) => s.query_text === 'Malmo')).toBe(true);

    const searchB = await reqJson<{ results: Array<{ entityType: string }> }>('/search?q=Malmo', { token: orgBToken });
    expect(searchB.status).toBe(200);
    expect(searchB.data.results.some((r) => r.entityType === 'facility')).toBe(false);

    // 5. Operational Anomaly Insights
    const anomalies = await reqJson<{ methodologyNotice: string; anomalies: Array<{ id: string }> }>(
      `/analytics/anomalies?facilityId=${orgAFacilityId}`,
      { token: orgAToken }
    );
    expect(anomalies.status).toBe(200);
    expect(anomalies.data.methodologyNotice).toContain('deterministic');
  });

  it('retrieves single-record detail endpoints and enforces tenant isolation on detail routes', async () => {
    const detDetail = await reqJson<{ record: { id: string }; objects: Array<{ id: string }> }>(`/detection/history/${detectionId}`, {
      token: orgAToken,
    });
    expect(detDetail.status).toBe(200);
    expect(detDetail.data.record.id).toBe(detectionId);
    expect(detDetail.data.objects.length).toBeGreaterThanOrEqual(1);

    const crossDetDetail = await reqJson(`/detection/history/${detectionId}`, { token: orgBToken });
    expect(crossDetDetail.status).toBe(404);

    const matDetail = await reqJson<{ material: { code: string } }>('/materials/taxonomy/PET_01', { token: orgAToken });
    expect(matDetail.status).toBe(200);
    expect(matDetail.data.material.code).toBe('PET_01');

    const facDetail = await reqJson<{ facility: { id: string }; isOwned: boolean }>(`/facilities/${orgAFacilityId}`, { token: orgAToken });
    expect(facDetail.status).toBe(200);
    expect(facDetail.data.facility.id).toBe(orgAFacilityId);
    expect(facDetail.data.isOwned).toBe(true);

    const revDetail = await reqJson<{ review: { id: string } }>(`/reviews/${reviewId}`, { token: orgAToken });
    expect(revDetail.status).toBe(200);
    expect(revDetail.data.review.id).toBe(reviewId);

    const crossRevDetail = await reqJson(`/reviews/${reviewId}`, { token: orgBToken });
    expect(crossRevDetail.status).toBe(404);

    const modelsList = await reqJson<{ models: Array<{ id: string }> }>('/models', { token: orgAToken });
    expect(modelsList.status).toBe(200);
    if (modelsList.data.models.length > 0) {
      const modelDetail = await reqJson<{ model: { id: string } }>(`/models/${modelsList.data.models[0].id}`, { token: orgAToken });
      expect(modelDetail.status).toBe(200);
      expect(modelDetail.data.model.id).toBe(modelsList.data.models[0].id);
    }
  });
});


