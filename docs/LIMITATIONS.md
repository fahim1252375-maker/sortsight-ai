# System Limitations & External Boundaries

To uphold rigorous technical transparency, the following constraints apply to the current SortSight AI deployment:

1. **Physical Hardware & PLC Gateways**:
   - Features #56 (Robotic Arm API), #57 (Industrial Camera Integration), and #58 (PLC Interface) execute inside an authenticated **SIMULATOR** environment (`mode: 'simulator'`). Actuating physical pneumatic air jets, conveyors, or delta robots requires an on-site plant network gateway with hardware safety interlocks.
2. **External GPU Training & Edge TensorRT Builds**:
   - Features #118 (Custom Model Training) and #119 (Transfer Learning Pipeline) manage dataset links, hyperparameters, and gated approval workflows in the web platform, while actual PyTorch GPU fine-tuning and confusion/ECE evaluation scripts run externally via `ml/train_eval_reference.py`.
   - Feature #128 (Edge AI Inference) runs deterministic CPU heuristic inference natively; NVIDIA Jetson TensorRT execution requires exporting ONNX weights onto edge hardware.
3. **Outbound SMTP Delivery**:
   - Feature #142 (Email Alerts) logs clearly labeled simulated dispatches (`email_simulated`) until `SMTP_HOST` and SMTP credentials are provisioned.
4. **Visual Hazard Disclaimer**:
   - Visual inspection cannot detect concealed chemical contents, internal battery short-circuits, or subsurface micro-contaminants. All hazard detections carry mandatory non-chemical-verification warnings.
5. **Sample vs Official Recycling Rules**:
   - Pre-seeded policies (`EU Packaging Reference`, `Oakland Single-Stream`) carry `policy_origin = 'admin_sample_policy'` and must not be mistaken for legally binding municipal codes without local verification.
6. **Stack Adaptation**:
   - The current web application uses Express/TypeScript + SQLite (`better-sqlite3`) on port `3000`. PostgreSQL is not wired into the application; Docker Compose persists the same SQLite database in a named volume.
