# Industrial Integrations & Hardware Boundary

## Explicit Sandbox Simulator Disclosure

**No physical PLC, robotic delta arm, air-jet manifold, or GigE Vision camera is attached in this web sandbox.** SortSight AI implements versioned REST adapters and a deterministic local **SIMULATOR** mode (`connection_mode = 'simulator'`, `executed_status = 'simulated'`) so automation engineers can design, test, and audit payloads without claiming live hardware actuation.

## Supported Integration Adapters (`server/routes/sorting.ts`)

1. **Conveyor Belt Session & Decision Engine**
   - `GET /api/v1/conveyor/sessions`, `POST /api/v1/conveyor/session`, `POST /api/v1/conveyor/tick`
   - Simulates belt speeds (`m/s`), emergency stops (`COIL_0001_ESTOP`), and air-jet ejector assignments (`DB104.DBW12`) logged in `sorting_decisions`.
2. **OPC-UA / Modbus-TCP PLC Bridge (`POST /api/v1/integrations/plc-command`)**
   - Produces structured coil/register payloads and persists simulated acknowledgements in `integration_events`.
   - Production deployment requires an on-site plant LAN gateway translating REST/MQTT commands into Siemens S7 / Allen-Bradley EtherNet/IP registers with physical safety relays.
3. **Robotic Arm Pick-Coordinate API (`POST /api/v1/integrations/robotic-pick`)**
   - Converts normalized `[ymin, xmin, ymax, xmax]` detection coordinates into calibrated physical belt space (`x_mm`, `y_mm`, `z_approach_mm`) for delta/6-axis pickers.
4. **Industrial Overhead Camera Adapter (`POST /api/v1/integrations/test-device`)**
   - Adapter specification and heartbeat health-check simulator for RTSP / GigE Vision frame ingestion.
5. **Signed Webhooks (`POST /api/v1/webhooks/:id/test`)**
   - Signs SCADA/ERP event payloads using HMAC-SHA256 (`sha256=...`) with secrets encrypted at rest via AES-256-GCM.
