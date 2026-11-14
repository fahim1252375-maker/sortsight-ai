# AI Model Documentation

## Dual-Provider Vision Architecture

SortSight AI routes all computer vision requests through the server-side 12-stage pipeline (`server/services/visionPipeline.ts`):

1. **Primary Cloud Provider (`gemini-4-hydrogen`)**:
   - Invoked exclusively server-side via `@google/genai` with structured JSON `responseSchema`, `User-Agent: aistudio-build`, and base64 inline image bytes.
   - Outputs normalized `[ymin, xmin, ymax, xmax]` (0–1000 scale), material code (`PET_01`..`UNKNOWN_OOD`), fine-grained label, visual explanation, morphological cues, packaging form, contamination severity, purity estimate, and hazard flags.
2. **Offline / Edge Fallback (`edge_heuristic_fallback`)**:
   - Deterministic CPU-native analyzer invoked automatically when `GEMINI_API_KEY` is absent/invalid, when cloud inference errors, or when the operator selects **Offline Edge Mode**.
   - Guarantees uninterrupted functionality without ever pretending that heuristic fallback outputs are cloud deep-learning predictions (`isFallbackMode = true`, `inferenceProvider = 'edge_heuristic_fallback'`).
3. **External PyTorch / YOLO / ONNX Edge Adapter (`mdl_yolo_ref`)**:
   - Documented adapter architecture and reference training/evaluation script (`ml/train_eval_reference.py`) for deploying custom-trained weights (e.g., YOLOv8n-seg ONNX/TensorRT) on facility edge IPCs or Jetson hardware.

## 12-Stage Processing Pipeline

1. **Input Validation** — Verifies `data:image/(jpeg|png|webp|gif);base64,...`, enforces minimum byte size (`64 B`) and max upload limit (`10 MB` default).
2. **Preprocessing** — Decodes image payload and resolves active facility + hierarchical recycling policy.
3. **Object Detection & Tracking** — Extracts bounding boxes and persistent `TRK-*` IDs for multi-frame video clips.
4. **Fine-Grained Classification** — Classifies across 19 ISO 14021 / EU LoW / Basel taxonomies including `UNKNOWN_OOD`.
5. **Image Segmentation** — Synthesizes or renders closed SVG segmentation polygon contours.
6. **Temperature-Scaled Confidence Calibration** — Applies $T = 1.18$ scaling on logits (`calibrateConfidence`) to mitigate overconfident spikes.
7. **Policy-Decoupled Recyclability** — Separates visual material identity from `recycling_policies` + `material_acceptance_rules`.
8. **Contamination & Residue Analysis** — Evaluates surface contamination %, food residue, and multi-layer laminate barriers.
9. **Hazard Escalation** — Automatically triggers `hazard_alerts` for lithium batteries (`BATT_LI`), chemical hazards (`HAZ_CHEM`), sharps, medical flags, and e-waste.
10. **Sorting Priority & Chute Routing** — Maps objects to facility chutes or `chute_manual_qc` when calibrated confidence `< 0.65` (or `< policy min_confidence_auto_sort`).
11. **Result Visualization** — Returns synchronized bounding boxes, polygons, explanations, and policy rationales.
12. **Persistence & Telemetry** — Persists records (`store_history` gated) and logs real latency ms per provider.

## Gated Continuous Learning Rule

Human QA overrides (`human_reviews`) flow into versioned datasets (`dataset_annotations`), candidate training jobs register as `staging` (`POST /api/v1/models/training-jobs`), and promotion to `production` strictly requires an authorized administrator approval call (`POST /api/v1/models/versions/:id/approve`). Models never self-deploy unapproved weights.
