# SortSight AI — Product Overview

**Tagline:** *See Waste Differently. Recover More. Waste Less.*

## Purpose & Target Users

SortSight AI is a global SaaS platform built for recycling companies, Material Recovery Facilities (MRFs), municipal waste authorities, industrial recovery operators, packaging recovery organizations (PROs), circular-economy analysts, and industrial automation teams.

## Core Functional Pillars

1. **Computer Vision & Material Intelligence** (`/scanner`, `/realtime`, `/batch`, `/materials`, `/contamination`)
   - Supports single image uploads, live webcam capture intervals, multi-frame video inspection with tracking IDs (`TRK-*`), and batch queues up to 10 frames.
   - Identifies 19 material categories spanning plastics (`PET_01`–`PS_06`), fibers (`OCC_CARD`, `PAPER_MIX`), metals (`ALUM_CAN`, `STEEL_FE`), glass (`GLASS_CLR`, `GLASS_COL`), textiles, organics, multi-layer laminates (`COMP_MLP`), electronics (`EWASTE_PCB`), hazardous items (`BATT_LI`, `HAZ_CHEM`), and `UNKNOWN_OOD`.
   - Computes transparent Readiness (`0-100`) and Recovery (`0-100`) scores decoupling material identity from facility-specific acceptance rules.

2. **Hazardous Waste Safety & Escalation** (`/hazards`)
   - Automatically detects and escalates visual hazard indicators (lithium-ion batteries, chemical drums/aerosols, sharp debris, clinical flags, PCBs) with recommended containment actions and mandatory disclaimers that visual inspection does not establish chemical safety.

3. **Smart Sorting Automation & Simulator** (`/sorting`, `/conveyor`, `/developers`)
   - Maps material classes across 8 configurable chutes using minimum auto-sort confidence and contamination ceilings.
   - Provides conveyor session controls (`start`, `pause`, `emergency_stop`, live simulation ticks) and documented REST/JSON adapters for OPC-UA/Modbus PLCs, robotic pick coordinates, and overhead industrial cameras in transparent simulator mode.

4. **Global Recycling Intelligence** (`/global-rules`, `/country-rules`, `/directory`)
   - Evaluates hierarchical policies (`facility -> region -> country -> global`) across curated Sweden (SE), Netherlands (NL), United States (US), Japan (JP), Germany (DE), and Singapore (SG) profiles with explicit `policy_origin` attribution.
   - Provides multi-language UI support across English (`en`), Swedish (`sv`), German (`de`), Spanish (`es`), and Japanese (`ja`).

5. **Analytics, Environmental Estimator & Operator Assistant** (`/analytics`, `/environment`, `/assistant`)
   - Tracks waste composition, recovery trends, facility benchmarking, CSV downloads, and jsPDF executive exports.
   - Models avoided CO2e, energy savings, and landfill diversion from recovered weights (`is_modeled_estimate = 1`).
   - Grounds natural-language operator Q&A against live database records with deterministic offline rule fallback.

6. **Human-in-the-Loop QA, Model Governance & Digital Twin** (`/reviews`, `/annotations`, `/models`, `/datasets`, `/digital-twin`, `/simulator`, `/material-flow`)
   - Escalates `< 0.65` predictions and hazards to QA reviewers, feeds verified overrides into versioned datasets, and enforces gated admin approval before promoting candidate model versions.
   - Simulates 7-stage MRF throughput bottlenecks, contamination hotspots, and 7-day projections inside the Digital Twin.

7. **Operations, Security & Multi-Tenant Administration** (`/operations`, `/inventory`, `/batches`, `/team`, `/notifications`, `/security`, `/settings`, `/profile`, `/admin`)
   - Covers complete collection batch intake-to-bale workflows, 6-role RBAC, SHA-256 API keys, HMAC webhooks, AES-256-GCM secret encryption, immutable audit logs, and tenant JSON backup/export.
