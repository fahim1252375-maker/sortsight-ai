import { GoogleGenAI } from '@google/genai';
import Database from 'better-sqlite3';
import { config } from '../config.ts';

export interface AssistantQueryInput {
  organizationId: string;
  facilityId?: string;
  question: string;
  taskType?: 'general_query' | 'report_summary' | 'anomaly_explanation' | 'contamination_advice' | 'sorting_guidance';
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AssistantResponse {
  answer: string;
  provider: 'gemini-4-hydrogen' | 'grounded_rule_fallback';
  isFallback: boolean;
  citations: Array<{ sourceType: string; id: string; title: string }>;
}

export async function queryOperatorAssistant(
  db: Database.Database,
  input: AssistantQueryInput
): Promise<AssistantResponse> {
  // Gather real database context scoped strictly to the tenant organization
  const facilities = db
    .prepare('SELECT id, name, country_code, region, capacity_tons_per_day FROM facilities WHERE organization_id = ?')
    .all(input.organizationId) as Array<{ id: string; name: string; country_code: string; region: string; capacity_tons_per_day: number }>;

  const activeFacilityId = input.facilityId || facilities[0]?.id;

  const openHazards = db
    .prepare('SELECT id, hazard_type, severity, title, warning_message, status FROM hazard_alerts WHERE organization_id = ? ORDER BY created_at DESC LIMIT 5')
    .all(input.organizationId) as Array<{ id: string; hazard_type: string; severity: string; title: string; warning_message: string; status: string }>;

  const recentDetections = db
    .prepare('SELECT id, image_name, inference_provider, overall_readiness_score, overall_recovery_score, object_count, has_hazards, created_at FROM detection_records WHERE organization_id = ? ORDER BY created_at DESC LIMIT 8')
    .all(input.organizationId) as Array<Record<string, unknown>>;

  const recentContam = db
    .prepare('SELECT id, contamination_type, severity, purity_estimate_pct, description FROM contamination_records WHERE organization_id = ? ORDER BY created_at DESC LIMIT 6')
    .all(input.organizationId) as Array<{ id: string; contamination_type: string; severity: string; purity_estimate_pct: number; description: string }>;

  const policies = db
    .prepare('SELECT id, title, policy_origin, source_attribution, effective_date FROM recycling_policies WHERE organization_id = ? AND is_active = 1')
    .all(input.organizationId) as Array<{ id: string; title: string; policy_origin: string; source_attribution: string; effective_date: string }>;

  const snapshots = db
    .prepare('SELECT snapshot_date, recovery_rate_pct, contamination_rate_pct, sorting_accuracy_pct, throughput_tons FROM analytics_snapshots WHERE organization_id = ? ORDER BY snapshot_date DESC LIMIT 5')
    .all(input.organizationId) as Array<Record<string, unknown>>;

  const pendingReviews = db
    .prepare("SELECT COUNT(*) as cnt FROM human_reviews WHERE organization_id = ? AND review_status = 'pending'")
    .get(input.organizationId) as { cnt: number };

  const citations: AssistantResponse['citations'] = [
    ...policies.map((p) => ({ sourceType: `Policy (${p.policy_origin})`, id: p.id, title: p.title })),
    ...openHazards.slice(0, 2).map((h) => ({ sourceType: 'Hazard Alert', id: h.id, title: h.title })),
  ];

  const contextBlock = JSON.stringify(
    {
      activeFacilityId,
      facilities,
      openHazards,
      pendingReviewCount: pendingReviews.cnt,
      recentDetections,
      recentContamination: recentContam,
      activePolicies: policies,
      recentAnalyticsSnapshots: snapshots,
    },
    null,
    2
  );

  if (config.geminiApiKey && config.geminiApiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey: config.geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const historyText = (input.history || [])
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${historyText ? `Prior conversation:\n${historyText}\n\n` : ''}Task Mode: ${input.taskType || 'general_query'}\nUser Question: ${input.question}\n\nGrounded Organization Data:\n${contextBlock}`,
        config: {
          systemInstruction:
            'You are the SortSight AI Recycling Operations Assistant. Answer concisely and accurately using ONLY the grounded organization data and verified recycling engineering principles. Cite specific record IDs (e.g., haz_demo_1, pol_got_fac) when referencing platform records. Never invent facility statistics, accuracy numbers, or official municipal regulations—explicitly remind operators when policies are marked admin_sample_policy.',
        },
      });

      if (response.text) {
        return {
          answer: response.text,
          provider: 'gemini-4-hydrogen',
          isFallback: false,
          citations,
        };
      }
    } catch {
      // Fall through cleanly to grounded deterministic fallback
    }
  }

  // Deterministic grounded fallback when AI provider is offline or quota-limited
  const q = input.question.toLowerCase();
  const latestSnap = snapshots[0] as { recovery_rate_pct?: number; contamination_rate_pct?: number; sorting_accuracy_pct?: number } | undefined;
  let answer = '';

  if (q.includes('hazard') || q.includes('battery') || q.includes('fire') || input.taskType === 'anomaly_explanation') {
    answer = `Grounded Operations Brief (Offline Assistant Mode):\n• Open Hazard Alerts: ${openHazards.length} (${openHazards.map((h) => `${h.id}: ${h.title} [${h.severity}]`).join('; ') || 'None'})\n• Pending Human Reviews: ${pendingReviews.cnt}\n• Recommended Action: Inspect open critical battery/chemical alerts immediately and isolate before compaction. Note: Visual detection is not chemical verification.`;
  } else if (q.includes('summar') || q.includes('report') || input.taskType === 'report_summary') {
    answer = `Executive Operational Summary (Grounded Platform Data):\n• Active Facilities: ${facilities.map((f) => f.name).join(', ')}\n• Latest Recovery Rate: ${latestSnap?.recovery_rate_pct ?? 'N/A'}% | Contamination Rate: ${latestSnap?.contamination_rate_pct ?? 'N/A'}% | Sorting Accuracy: ${latestSnap?.sorting_accuracy_pct ?? 'N/A'}%\n• Recent Contamination Factors: ${recentContam.map((c) => `${c.contamination_type} (${c.severity})`).join(', ') || 'None logged'}\n• Active Policies: ${policies.map((p) => `${p.title} [${p.policy_origin}]`).join('; ')}`;
  } else if (q.includes('contaminat') || q.includes('grease') || q.includes('purity')) {
    answer = `Contamination Analysis Summary:\n• Recent flagged contamination events (${recentContam.length}): ${recentContam.map((c) => `${c.id}: ${c.contamination_type} (Purity ~${c.purity_estimate_pct}%)`).join(' | ') || 'No contamination records.'}\n• Guidance: Divert food-soiled OCC and multi-layer composites before baling to preserve fiber and mono-polymer bale value.`;
  } else {
    answer = `SortSight Grounded Assistant (Offline Rule Fallback):\n• Facilities in Scope: ${facilities.length} (${facilities.map((f) => `${f.name} [${f.country_code}]`).join(', ')})\n• Recent Scans Recorded: ${recentDetections.length} | Pending QA Reviews: ${pendingReviews.cnt} | Open Hazards: ${openHazards.length}\n• Active Policy Reference: ${policies[0]?.title || 'None'} (${policies[0]?.source_attribution || 'N/A'}).`;
  }

  return {
    answer,
    provider: 'grounded_rule_fallback',
    isFallback: true,
    citations,
  };
}
