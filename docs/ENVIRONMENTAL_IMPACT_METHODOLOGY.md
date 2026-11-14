# Environmental Impact Methodology

## Core Integrity Principle

SortSight AI **strictly separates measured recovered mass (`measured_recovered_kg`) from modeled environmental displacement estimates (`is_modeled_estimate = 1`)**. Modeled CO2e, energy, and landfill savings are engineering estimates — **not** audited carbon credits or regulatory offsets.

## Calculation Model (`POST /api/v1/environment/estimate`)

For each material category $m$ with user-entered or batch-measured recovered mass $W_m$ (`kg`) and configurable sensitivity scale factor $\alpha \in [0.5, 1.5]$:

$$\text{CO}_2\text{e Avoided (kg)} = \sum_m W_m \cdot F_{\text{CO}_2, m} \cdot \alpha$$
$$\text{Energy Saved (kWh)} = \sum_m W_m \cdot F_{\text{kWh}, m} \cdot \alpha$$
$$\text{Landfill Volume Diverted (m}^3\text{)} = \sum_m W_m \cdot F_{\text{m}^3, m}$$

### Baseline Material Factors (`material_categories`)
Factors stored in SQLite (`seed.ts`) reflect reference lifecycle displacement baselines modeled on public EPA WARM / EU JRC published ranges, for example:
- `ALUM_CAN`: High virgin smelting displacement (`co2_saved_kg_per_kg = 9.1`, `energy_saved_kwh_per_kg = 14.0`)
- `PET_01`: Polymer displacement (`co2_saved_kg_per_kg = 1.8`, `energy_saved_kwh_per_kg = 5.3`)
- `OCC_CARD`: Fiber recovery (`co2_saved_kg_per_kg = 1.1`, `energy_saved_kwh_per_kg = 2.4`)
- `BATT_LI` / `HAZ_CHEM`: Set to `0.0` displacement credits because hazardous isolation does not generate recycled-commodity offset credits.

## Scope & Exclusions

- Excludes outbound transport emissions, MRF electricity draw, and secondary reprocessing yield loss unless adjusted via the sensitivity multiplier $\alpha$.
- Assumptions JSON (`assumptions_json`) and methodology text are persisted alongside every row in `environmental_estimates` for transparent auditability.
