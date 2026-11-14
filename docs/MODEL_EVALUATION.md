# Model Evaluation & Calibration Methodology

## No-Fabricated-Accuracy Policy

SortSight AI **never invents static accuracy metrics** for live cloud zero-shot inference (`mver_gemini_1` stores `precision_score = null`, `recall_score = null`, `f1_score = null`). Live sorting accuracy is measured dynamically per organization from verified outcomes in `human_reviews` (`GET /api/v1/sorting/metrics`).

## Evaluation Metrics Supported

| Metric | Definition & Implementation |
|---|---|
| **Precision / Recall / F1** | Computed per material class from confusion matrices via `ml/train_eval_reference.py` (`compute_confusion_and_metrics`) and tracked per model version in `model_versions`. |
| **Confusion Matrix & Error Pairs** | Aggregated dynamically from `human_reviews` where `review_status IN ('corrected', 'added_to_dataset')` via `GET /api/v1/reviews/errors`. |
| **Confidence Calibration (ECE)** | Raw confidence is scaled with temperature $T = 1.18$ (`calibrateConfidence`); bin-wise Expected Calibration Error (`compute_ece`) is evaluated in Python ML reference tooling. |
| **Drift Detection** | `GET /api/v1/models/drift` monitors class distribution shifts and triggers `elevated` alerts when low-confidence ratio exceeds `25%`. |
| **Inference Latency Telemetry** | `GET /api/v1/models/telemetry` reports min, max, and average latency (`ms`) segmented by `inference_provider`. |

## Offline Edge Heuristic Baseline Benchmark

- Model version `mver_edge_1` (`v1.0-offline`) records transparent offline baseline metrics evaluated across a local 200-sample synthetic bench (`precision: 0.61`, `recall: 0.58`, `f1: 0.59`, `ECE: 0.095`, `avg_latency_ms: 18 ms`) explicitly marked as staging fallback performance rather than production deep-learning performance.

## Reproducible Reference Execution

```bash
python3 ml/train_eval_reference.py
```
Outputs JSON containing per-class precision/recall/F1, confusion matrix, and 10-bin ECE.
