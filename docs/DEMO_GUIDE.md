# Hackathon Live Demonstration Guide (2–3 Minutes)

This walkthrough demonstrates genuine end-to-end SortSight AI functionality live on `http://localhost:3000`.

## Pre-Demo Check
- Start server (`npm run dev` or production `npm start`).
- Keep `admin@sortsight.demo` / `SortSightDemo2026!` ready (or click **Launch Interactive Sandbox** on the Landing Page).

## 0:00 – 0:30 | Context & Multi-Tenant Architecture
- Show the Public Landing Page and MRF optical gantry schematic, then click **Launch Interactive Sandbox** to authenticate as `Nordic Loop Recovery (Gothenburg MRF #1)`.
- Point out the topbar facility switcher (`Gothenburg Optical MRF #1` vs `Stockholm Paper & Polymer Hub`) and multi-language switcher (`en`, `sv`, `de`, `es`, `ja`).

## 0:30 – 1:15 | Live 12-Stage Computer Vision & Hazard Escalation
- Open **Smart Waste Scanner (`/scanner`)**.
- Click the built-in **Lithium Hazard + E-Waste Frame** canvas sample (or upload a photo).
- Run inspection (either `Cloud Gemini Vision` if `GEMINI_API_KEY` is configured or `Offline Edge Mode`).
- Show bounding boxes + SVG segmentation polygons, calibrated confidence (`< 0.65` QA escalation flag), polymer-vs-policy recyclability decoupling, and critical **Lithium Battery Fire Hazard** isolation guidance.

## 1:15 – 1:55 | Policy Engine, Sorting Simulator & Human-in-the-Loop QA
- Open **Conveyor Monitoring (`/conveyor`)**: click **Run Simulation Tick** to generate a real-time `SIMULATOR` PLC routing decision across chutes.
- Open **Human Review Center (`/reviews`)**: verify or correct a flagged `< 0.65` item, then click **Promote to Dataset** to send the verified label directly into active learning (`datasets`) and inspect the immutable entry in **Security & Audit Center (`/security`)**.

## 1:55 – 2:35 | Digital Twin Optimization & Environmental Transparency
- Open **Optimization Simulator (`/simulator`)** & **Digital Twin (`/digital-twin`)**: adjust infeed rate (`tph`) and air-jet boost, run a scenario, and inspect stage bottlenecks + 7-day projection clearly labeled **SIMULATION MODEL**.
- Open **Environmental Impact Estimator (`/environment`)** or **Analytics Center (`/analytics`)**: demonstrate separation between measured kg / live scans vs `DEMO DATA` snapshots, and download a live CSV/PDF operational report.
