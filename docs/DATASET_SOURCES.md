# Dataset Sources, Provenance & Imbalance Analysis

## Public Reference Benchmarks

| Dataset ID | Name | License | Provenance URL | Split Strategy | Role in SortSight AI |
|---|---|---|---|---|---|
| `ds_taco_bench` | TACO + MRF Conveyor Benchmark (Reference) | MIT / CC-BY-4.0 | `https://tacodataset.org/` | `70% Train / 15% Val / 15% Test (Scene-Grouped, Zero Leakage)` | Baseline taxonomy calibration and class-imbalance schema validation |
| `ds_gothenburg_corrected` | Gothenburg Active-Learning Verified Corrections | Internal Organization Dataset | `internal://org_nordic_mrf/annotations` | `80% Train / 20% Eval (Facility-Scoped)` | Stores human-verified low-confidence corrections promoted via Review Center |

## License & Compliance Policy

- Only open/permissive benchmarks (e.g., TACO under MIT / CC-BY-4.0) or customer-owned facility imagery collected with tenant consent are permitted.
- Proprietary web scraping or unlicensed datasets are strictly prohibited.

## Class Imbalance & Leakage Prevention

1. **Class Imbalance**: Public consumer litter benchmarks over-represent clear PET bottles (`PET_01`: 280), corrugated cardboard (`OCC_CARD`: 240), and aluminum cans (`ALUM_CAN`: 220), while under-representing lithium batteries (`BATT_LI`: 45) and textile entanglement hazards (`TEXTILE`: 75).
2. **Mitigation**: Active Learning (`human_reviews`) prioritizes `< 0.65` predictions and hazard false-negatives for annotation promotion (`POST /api/v1/reviews/:id/promote-dataset`).
3. **Zero-Leakage Splits**: Frame sequences and scene bursts are grouped strictly at sequence/session level so sequential video frames never straddle training and evaluation splits.
4. **Out-of-Distribution Handling**: Items with unclear optical signatures map to `UNKNOWN_OOD` and route unconditionally to `chute_manual_qc`.

## Known Dataset Limitations

- Public static litter datasets under-represent high-speed MRF belt motion blur, compaction crushing, wet fiber saturation, and heavy occlusion.
- Environmental lighting variation across facilities requires per-facility domain adaptation via annotated samples.
