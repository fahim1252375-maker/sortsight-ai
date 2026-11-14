import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { encryptSecret } from './database.ts';

function seedEnterpriseDefaults(db: Database.Database): void {
  const hasOrg = db.prepare("SELECT id FROM organizations WHERE id = 'org_nordic_mrf'").get();
  if (!hasOrg) return;

  const viewCount = (db.prepare('SELECT COUNT(*) as cnt FROM saved_dashboard_views').get() as { cnt: number }).cnt;
  if (viewCount === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO saved_dashboard_views (id, organization_id, user_id, name, description, config_json, is_shared, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'usr_admin', ?, ?, ?, 1, 1)
    `).run(
      'view_demo_exec',
      'Nordic Executive 30-Day View',
      'All Gothenburg & Rotterdam facilities with 30-day recovery & hazard watch.',
      JSON.stringify({ facilityId: '', timeRange: '30d', focusArea: 'executive' })
    );

    db.prepare(`
      INSERT OR IGNORE INTO saved_dashboard_views (id, organization_id, user_id, name, description, config_json, is_shared, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'usr_manager', ?, ?, ?, 1, 1)
    `).run(
      'view_demo_got_ops',
      'Gothenburg Line A Contamination Watch',
      'Focused on Gothenburg Optical MRF #1 last 7 days throughput and QA alerts.',
      JSON.stringify({ facilityId: 'fac_gothenburg', timeRange: '7d', focusArea: 'contamination' })
    );
  }

  const handCount = (db.prepare('SELECT COUNT(*) as cnt FROM shift_handovers').get() as { cnt: number }).cnt;
  if (handCount === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO shift_handovers (id, organization_id, facility_id, shift_label, outgoing_user_id, outgoing_user_name, incoming_user_name, summary_notes, safety_notes, conveyor_status_snapshot, open_hazards_count, pending_reviews_count, items_processed_count, status, signed_off_by_user_id, signed_off_by_name, signed_off_at, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, 'usr_operator', 'Kenji Takahashi', 'Henrik Vermeer', ?, ?, 'running', 0, 1, 1420, 'acknowledged', 'usr_manager', 'Henrik Vermeer', '2026-11-13T06:12:00Z', 1)
    `).run(
      'hand_demo_1',
      'Night Shift C (22:00 – 06:00)',
      'Processed 1,420 optical detections across PET #1 and OCC Fiber streams. Chute 5 star screen cleared at 03:40.',
      'No thermal incidents; overhead magnet cleared of ferrous strapping.'
    );

    db.prepare(`
      INSERT OR IGNORE INTO shift_handovers (id, organization_id, facility_id, shift_label, outgoing_user_id, outgoing_user_name, incoming_user_name, summary_notes, safety_notes, conveyor_status_snapshot, open_hazards_count, pending_reviews_count, items_processed_count, status, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, 'usr_operator', 'Kenji Takahashi', 'Elena Rostova', ?, ?, 'paused', 1, 1, 1482, 'submitted', 1)
    `).run(
      'hand_demo_2',
      'Morning Shift A (06:00 – 14:00)',
      'Line A paused after swollen Li-ion battery alert (haz_demo_1) on infeed belt; 1,482 cumulative frames logged.',
      'CRITICAL: Verify Quarantine Firebox Chute 8 drum seal before resuming Optical Line A.'
    );
  }
}

export function seedDatabase(db: Database.Database, includeDemoData = true): void {
  const existingOrg = db.prepare('SELECT id FROM organizations LIMIT 1').get();
  if (existingOrg) {
    if (includeDemoData) seedEnterpriseDefaults(db);
    return;
  }

  const tx = db.transaction(() => {
    // 1. Roles & Permissions
    const roles = [
      {
        role_name: 'admin',
        description: 'Organization Administrator with full RBAC, policy, model promotion, security, and tenant settings access.',
        permissions: ['*'],
      },
      {
        role_name: 'facility_manager',
        description: 'Facility Manager overseeing MRF operations, sorting rules, batches, inventory, and team tasks.',
        permissions: [
          'facilities:read', 'facilities:write', 'detections:read', 'detections:write',
          'policies:read', 'policies:write', 'sorting:read', 'sorting:write',
          'operations:read', 'operations:write', 'reviews:read', 'reviews:write',
          'analytics:read', 'simulations:read', 'simulations:write', 'models:read',
          'notifications:read', 'assistant:use',
        ],
      },
      {
        role_name: 'operator',
        description: 'Line Operator running Waste Scanner, Conveyor Monitoring, Hazard Isolation, and Collection Batches.',
        permissions: [
          'facilities:read', 'detections:read', 'detections:write', 'policies:read',
          'sorting:read', 'conveyor:operate', 'hazards:acknowledge', 'operations:read',
          'operations:write', 'assistant:use', 'notifications:read',
        ],
      },
      {
        role_name: 'reviewer',
        description: 'Human-in-the-Loop QA Reviewer verifying low-confidence predictions and curating annotations.',
        permissions: [
          'facilities:read', 'detections:read', 'reviews:read', 'reviews:write',
          'annotations:read', 'annotations:write', 'models:read', 'datasets:read',
          'assistant:use', 'notifications:read',
        ],
      },
      {
        role_name: 'analyst',
        description: 'Sustainability & Data Analyst accessing Analytics Center, Environmental Estimator, and Digital Twin.',
        permissions: [
          'facilities:read', 'detections:read', 'analytics:read', 'analytics:export',
          'simulations:read', 'simulations:write', 'policies:read', 'assistant:use',
          'notifications:read',
        ],
      },
      {
        role_name: 'viewer',
        description: 'Read-only stakeholder access to dashboards and facility directory.',
        permissions: ['facilities:read', 'analytics:read', 'policies:read', 'notifications:read'],
      },
    ];

    const insertRole = db.prepare(
      'INSERT OR IGNORE INTO roles_permissions (role_name, description, permissions_json) VALUES (?, ?, ?)'
    );
    for (const r of roles) {
      insertRole.run(r.role_name, r.description, JSON.stringify(r.permissions));
    }

    // 2. Global Material Categories (18 Fine-Grained Categories)
    const materials = [
      { code: 'PET_01', name: 'PET Plastic (Resin #1)', parent: 'Plastics', ric: 'ISO 14021 / RIC 1', low: '15 01 02', hazard: 'none', rec: 1, desc: 'Polyethylene terephthalate beverage bottles and clear thermoformed clamshells.', co2: 1.85, kwh: 5.4, m3: 0.0032 },
      { code: 'HDPE_02', name: 'HDPE Plastic (Resin #2)', parent: 'Plastics', ric: 'ISO 14021 / RIC 2', low: '15 01 02', hazard: 'none', rec: 1, desc: 'High-density polyethylene milk jugs, detergent containers, and rigid pipes.', co2: 1.62, kwh: 4.8, m3: 0.0029 },
      { code: 'PVC_03', name: 'PVC Plastic (Resin #3)', parent: 'Plastics', ric: 'ISO 14021 / RIC 3', low: '17 02 03', hazard: 'low', rec: 0, desc: 'Polyvinyl chloride blister packs and piping; causes chlorine contamination in PET streams.', co2: 0.9, kwh: 2.1, m3: 0.0018 },
      { code: 'LDPE_04', name: 'LDPE Film (Resin #4)', parent: 'Plastics', ric: 'ISO 14021 / RIC 4', low: '15 01 02', hazard: 'none', rec: 1, desc: 'Low-density polyethylene shrink wrap and bags; requires film-specific dry stream.', co2: 1.4, kwh: 3.9, m3: 0.0024 },
      { code: 'PP_05', name: 'Polypropylene (Resin #5)', parent: 'Plastics', ric: 'ISO 14021 / RIC 5', low: '15 01 02', hazard: 'none', rec: 1, desc: 'Rigid food tubs, bottle caps, and industrial crates.', co2: 1.55, kwh: 4.2, m3: 0.0026 },
      { code: 'PS_06', name: 'Polystyrene / EPS (Resin #6)', parent: 'Plastics', ric: 'ISO 14021 / RIC 6', low: '15 01 02', hazard: 'none', rec: 0, desc: 'Expanded foam packaging and brittle disposable foodware; low MRF recovery rate.', co2: 1.1, kwh: 2.5, m3: 0.0045 },
      { code: 'ALUM_CAN', name: 'Aluminum Beverage & Foil', parent: 'Metals', ric: 'ALU 41', low: '15 01 04', hazard: 'none', rec: 1, desc: 'Non-ferrous aluminum cans and clean rigid trays recovered via Eddy Current.', co2: 9.1, kwh: 14.2, m3: 0.0019 },
      { code: 'STEEL_FE', name: 'Ferrous Steel & Tinplate', parent: 'Metals', ric: 'FE 40', low: '15 01 04', hazard: 'none', rec: 1, desc: 'Magnetic food cans and scrap steel recovered via overhead belt magnet.', co2: 1.95, kwh: 3.6, m3: 0.0012 },
      { code: 'GLASS_CLR', name: 'Clear Flint Glass', parent: 'Glass', ric: 'GL 70', low: '15 01 07', hazard: 'none', rec: 1, desc: 'Clear food jars and beverage bottles suitable for closed-loop cullet.', co2: 0.32, kwh: 0.9, m3: 0.0008 },
      { code: 'GLASS_COL', name: 'Colored Glass (Amber/Green)', parent: 'Glass', ric: 'GL 71/72', low: '15 01 07', hazard: 'none', rec: 1, desc: 'Green and amber glass containers requiring color sorting.', co2: 0.30, kwh: 0.85, m3: 0.0008 },
      { code: 'OCC_CARD', name: 'Corrugated Cardboard (OCC)', parent: 'Paper & Fiber', ric: 'PAP 20', low: '15 01 01', hazard: 'none', rec: 1, desc: 'Double-wall and single-wall shipping cartons; sensitive to moisture and grease.', co2: 1.12, kwh: 2.7, m3: 0.0031 },
      { code: 'PAPER_MIX', name: 'Mixed Office & Newsprint', parent: 'Paper & Fiber', ric: 'PAP 21/22', low: '15 01 01', hazard: 'none', rec: 1, desc: 'Printed paper, magazines, and dry paperboard.', co2: 0.98, kwh: 2.4, m3: 0.0028 },
      { code: 'TEXTILE', name: 'Textiles & Apparel Fiber', parent: 'Textiles', ric: 'TEX 60/62', low: '20 01 11', hazard: 'none', rec: 1, desc: 'Natural cotton and synthetic garments; entangles rotating MRF screens if loose.', co2: 3.6, kwh: 6.1, m3: 0.0035 },
      { code: 'ORGANIC', name: 'Organic & Food Waste', parent: 'Organics', ric: 'BIO / FOR 50', low: '20 01 08', hazard: 'none', rec: 1, desc: 'Compostable kitchen scraps and yard waste; major fiber contaminant in dry MRFs.', co2: 0.45, kwh: 0.4, m3: 0.0015 },
      { code: 'COMP_MLP', name: 'Multi-Layer Composite Packaging', parent: 'Composites', ric: 'C/PAP 84 / C/LDPE 90', low: '15 01 05', hazard: 'none', rec: 0, desc: 'Foil-lined snack pouches, aseptic beverage cartons, and laminated cups.', co2: 0.65, kwh: 1.2, m3: 0.0021 },
      { code: 'EWASTE_PCB', name: 'Electronic Waste & Cables', parent: 'E-Waste', ric: 'WEEE / RoHS', low: '16 02 14', hazard: 'moderate', rec: 1, desc: 'Circuit boards, chargers, small appliances requiring specialized WEEE disassembly.', co2: 4.8, kwh: 8.5, m3: 0.0014 },
      { code: 'BATT_LI', name: 'Lithium-Ion Battery / Cell', parent: 'Hazardous', ric: 'UN 3480 / WEEE', low: '16 06 05', hazard: 'critical', rec: 0, desc: 'Rechargeable lithium cells posing severe thermal runaway and MRF baler fire risk.', co2: 5.5, kwh: 9.2, m3: 0.0005 },
      { code: 'HAZ_CHEM', name: 'Hazardous Chemical / Medical / Sharp', parent: 'Hazardous', ric: 'ADR / Basel Y', low: '15 01 10*', hazard: 'critical', rec: 0, desc: 'Solvent canisters, pressurized aerosols, medical sharps, or unidentified chemical vessels.', co2: 0.0, kwh: 0.0, m3: 0.0005 },
      { code: 'UNKNOWN_OOD', name: 'Unknown / Out-of-Distribution Object', parent: 'Unclassified', ric: 'OOD-REVIEW', low: '20 03 01', hazard: 'low', rec: 0, desc: 'Unrecognized object escalated to human review before sorting assignment.', co2: 0.0, kwh: 0.0, m3: 0.0 },
    ];

    const insertMaterial = db.prepare(`
      INSERT OR IGNORE INTO material_categories
      (code, id, name, parent_group, resin_or_standard_code, eu_low_code, hazard_class, default_recyclable, description, co2_saved_kg_per_kg, energy_saved_kwh_per_kg, landfill_diverted_m3_per_kg)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of materials) {
      insertMaterial.run(
        m.code, `mat_${m.code.toLowerCase()}`, m.name, m.parent, m.ric, m.low,
        m.hazard, m.rec, m.desc, m.co2, m.kwh, m.m3
      );
    }

    // Core role permissions and the global material taxonomy are required in every environment.
    // Production intentionally skips demo organizations, accounts, and sample records.
    if (!includeDemoData) return;

    // 3. Organizations (Multi-Tenant Isolation)
    db.prepare(`
      INSERT INTO organizations (id, name, slug, country_code, region, industry_type, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run('org_nordic_mrf', 'Nordic Circular MRF Group (DEMO)', 'nordic-circular-demo', 'SE', 'Europe (Nordics)', 'Material Recovery Facility');

    db.prepare(`
      INSERT INTO organizations (id, name, slug, country_code, region, industry_type, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run('org_pacific_rec', 'Pacific Rim Recovery Co. (DEMO)', 'pacific-rim-demo', 'US', 'North America', 'Municipal & Industrial Recycling');

    // 4. Users (Password: SortSightDemo2026!)
    const demoPassHash = bcrypt.hashSync('SortSightDemo2026!', 10);
    const users = [
      { id: 'usr_admin', email: 'admin@sortsight.demo', name: 'Astrid Lindqvist', initials: 'AL', org: 'org_nordic_mrf', role: 'admin', fac: 'fac_gothenburg' },
      { id: 'usr_manager', email: 'manager@sortsight.demo', name: 'Henrik Vermeer', initials: 'HV', org: 'org_nordic_mrf', role: 'facility_manager', fac: 'fac_gothenburg' },
      { id: 'usr_operator', email: 'operator@sortsight.demo', name: 'Kenji Takahashi', initials: 'KT', org: 'org_nordic_mrf', role: 'operator', fac: 'fac_gothenburg' },
      { id: 'usr_reviewer', email: 'reviewer@sortsight.demo', name: 'Elena Rostova', initials: 'ER', org: 'org_nordic_mrf', role: 'reviewer', fac: 'fac_gothenburg' },
      { id: 'usr_analyst', email: 'analyst@sortsight.demo', name: 'Marcus Vance', initials: 'MV', org: 'org_nordic_mrf', role: 'analyst', fac: 'fac_rotterdam' },
      { id: 'usr_pacific', email: 'oakland@sortsight.demo', name: 'Maya Chen', initials: 'MC', org: 'org_pacific_rec', role: 'admin', fac: 'fac_oakland' },
    ];
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, avatar_initials, is_demo_data)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertMembership = db.prepare(`
      INSERT INTO organization_memberships (id, organization_id, user_id, role_name, assigned_facility_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const u of users) {
      insertUser.run(u.id, u.email, demoPassHash, u.name, u.initials);
      insertMembership.run(`mem_${u.id}`, u.org, u.id, u.role, u.fac);
    }

    // 5. Facilities
    const facilities = [
      { id: 'fac_gothenburg', org: 'org_nordic_mrf', name: 'Gothenburg Optical MRF #1', code: 'SE-GOT-01', type: 'Optical & Robotic MRF', country: 'SE', region: 'Northern Europe', city: 'Gothenburg', lat: 57.7089, lng: 11.9746, cap: 185 },
      { id: 'fac_rotterdam', org: 'org_nordic_mrf', name: 'Rotterdam Packaging Recovery Hub', code: 'NL-RTM-02', type: 'Packaging Recovery Facility', country: 'NL', region: 'Western Europe', city: 'Rotterdam', lat: 51.9244, lng: 4.4777, cap: 240 },
      { id: 'fac_oakland', org: 'org_pacific_rec', name: 'Oakland Municipal Single-Stream MRF', code: 'US-OAK-01', type: 'Municipal MRF', country: 'US', region: 'California', city: 'Oakland', lat: 37.8044, lng: -122.2712, cap: 210 },
      { id: 'fac_osaka', org: 'org_pacific_rec', name: 'Osaka Automated Polymer & WEEE Center', code: 'JP-OSA-03', type: 'Industrial Polymer & WEEE Plant', country: 'JP', region: 'Kansai', city: 'Osaka', lat: 34.6937, lng: 135.5023, cap: 160 },
    ];
    const insertFac = db.prepare(`
      INSERT INTO facilities (id, organization_id, name, facility_code, facility_type, country_code, region, city, latitude, longitude, capacity_tons_per_day, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const f of facilities) {
      insertFac.run(f.id, f.org, f.name, f.code, f.type, f.country, f.region, f.city, f.lat, f.lng, f.cap);
    }

    // 6. Global & Facility Recycling Policies (Transparent attribution)
    const policies = [
      {
        id: 'pol_eu_sample',
        org: 'org_nordic_mrf',
        fac: null,
        scope: 'region',
        country: 'SE',
        region: 'European Union / Sweden (Sample Reference)',
        title: 'EU Packaging & WEEE Reference Baseline (Sample Policy)',
        origin: 'admin_sample_policy',
        source: 'Sample reference modeled on EU Packaging Directive 94/62/EC & Swedish EPR guidelines — verify locally before compliance sign-off.',
        date: '2026-01-15',
        i18n: {
          en: 'Separate clean PET, HDPE, metals, and dry fiber. Divert all batteries and WEEE to dedicated hazardous drop-off.',
          sv: 'Sortera ren PET, HDPE, metaller och torr fiber separat. Batterier och elavfall ska till farligt avfall.',
          de: 'Sauberes PET, HDPE, Metalle und trockene Fasern trennen. Batterien und Elektroschrott getrennt erfassen.',
          es: 'Separe PET, HDPE, metales y fibra seca. Desvíe baterías y RAEE a puntos de manejo peligroso.',
          ja: 'PET、HDPE、金属、乾いた古紙を分別してください。リチウム電池と小型家電は専用回収へ。',
        },
      },
      {
        id: 'pol_got_fac',
        org: 'org_nordic_mrf',
        fac: 'fac_gothenburg',
        scope: 'facility',
        country: 'SE',
        region: 'Gothenburg Line A/B',
        title: 'Gothenburg Optical MRF #1 Acceptance Policy',
        origin: 'facility_custom',
        source: 'Gothenburg Plant Operations Manual Rev 4.2 (Demo Facility Policy)',
        date: '2026-03-01',
        i18n: {
          en: 'Accepts PET #1, HDPE #2, PP #5, Aluminum, Steel, OCC, Glass. Rejects LDPE film >5% moisture and multi-layer pouches.',
          sv: 'Tar emot PET #1, HDPE #2, PP #5, aluminium, stål, wellpapp och glas. Avvisar fuktig film och flerskiktsförpackningar.',
        },
      },
      {
        id: 'pol_us_ca',
        org: 'org_pacific_rec',
        fac: 'fac_oakland',
        scope: 'facility',
        country: 'US',
        region: 'California SB 54 Sample Reference',
        title: 'Oakland Single-Stream Acceptance Policy (Sample)',
        origin: 'admin_sample_policy',
        source: 'Demo municipal single-stream acceptance profile modeled after California MRF intake rules.',
        date: '2026-02-10',
        i18n: {
          en: 'Empty and dry containers required. No bagged film, no lithium batteries, no sharps or medical waste.',
        },
      },
    ];
    const insertPolicy = db.prepare(`
      INSERT INTO recycling_policies (id, organization_id, facility_id, scope_level, country_code, region_name, title, policy_origin, source_attribution, effective_date, localized_instructions_json, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const p of policies) {
      insertPolicy.run(p.id, p.org, p.fac, p.scope, p.country, p.region, p.title, p.origin, p.source, p.date, JSON.stringify(p.i18n));
    }

    // Acceptance Rules for Gothenburg & Oakland
    const insertRule = db.prepare(`
      INSERT INTO material_acceptance_rules (id, policy_id, material_code, accepted, max_contamination_pct, requires_separation, target_bin, condition_notes, guidance_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const gotRules: Array<[string, number, number, number, string, string, string]> = [
      ['PET_01', 1, 8.0, 0, 'chute_pet_clear', 'Caps may stay on if crushed; empty liquids.', 'Route to NIR Optical PET Ejector #1'],
      ['HDPE_02', 1, 8.0, 0, 'chute_hdpe_rigid', 'Rinse heavy detergent residue.', 'Route to NIR Optical HDPE Ejector #2'],
      ['PVC_03', 0, 0.5, 1, 'chute_reject_residue', 'Not accepted in PET/HDPE baler stream.', 'Divert to Residue/RDF rejection stream'],
      ['LDPE_04', 0, 2.0, 1, 'chute_film_manual', 'Loose film wraps disc screens.', 'Manual pull or negative-air film hood'],
      ['PP_05', 1, 10.0, 0, 'chute_pp_mixed', 'Food tubs accepted if scraped clean.', 'Route to PP Optical Ejector #3'],
      ['PS_06', 0, 1.0, 1, 'chute_reject_residue', 'EPS foam not compacted at this facility.', 'Divert to Reject stream'],
      ['ALUM_CAN', 1, 5.0, 0, 'chute_eddy_aluminum', 'High recovery value; keep dry.', 'Eddy Current Non-Ferrous Chute'],
      ['STEEL_FE', 1, 8.0, 0, 'chute_magnet_ferrous', 'Ferrous scrap accepted.', 'Overband Magnet Chute'],
      ['GLASS_CLR', 1, 4.0, 1, 'chute_glass_cullet', 'Separate before optical plastic stage.', 'Glass Breaker Screen'],
      ['GLASS_COL', 1, 4.0, 1, 'chute_glass_cullet', 'Colored cullet stream.', 'Glass Breaker Screen'],
      ['OCC_CARD', 1, 5.0, 0, 'chute_fiber_occ', 'Reject if grease-stained or >12% moisture.', 'Star Screen OCC Over-Fraction'],
      ['PAPER_MIX', 1, 6.0, 0, 'chute_fiber_mixed', 'Dry fiber only.', 'Fiber Optical Air-Knife'],
      ['TEXTILE', 0, 1.0, 1, 'chute_textile_bypass', 'Divert before rotating screens.', 'Pre-Sort Manual Pull -> Textile Reuse Bay'],
      ['ORGANIC', 0, 2.0, 1, 'chute_compost_bypass', 'Contaminates paper bales.', 'Pre-Sort Divert to Anaerobic Digester'],
      ['COMP_MLP', 0, 1.0, 1, 'chute_reject_residue', 'Multi-layer foil not separable at MRF.', 'Divert to Energy Recovery / Reject'],
      ['EWASTE_PCB', 0, 0.0, 1, 'chute_weee_quarantine', 'Requires licensed WEEE recycler.', 'Immediate Pre-Sort Pull -> WEEE Cage'],
      ['BATT_LI', 0, 0.0, 1, 'chute_hazard_firebox', 'CRITICAL FIRE HAZARD in shredders/balers.', 'HALT CONVEYOR & ISOLATE IN SAND DRUM'],
      ['HAZ_CHEM', 0, 0.0, 1, 'chute_hazard_quarantine', 'Do not crush or compact.', 'HALT & ESCALATE TO HAZMAT OFFICER'],
      ['UNKNOWN_OOD', 0, 0.0, 1, 'chute_manual_qc', 'Uncertain classification.', 'Divert to Manual QC Inspection Belt'],
    ];
    for (const r of gotRules) {
      insertRule.run(`rule_got_${r[0].toLowerCase()}`, 'pol_got_fac', r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
      insertRule.run(`rule_oak_${r[0].toLowerCase()}`, 'pol_us_ca', r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
    }

    // 7. Datasets & AI Models
    db.prepare(`
      INSERT INTO datasets (id, organization_id, name, version_tag, license, provenance_url, split_strategy, sample_count, class_distribution_json, limitations_notes, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      'ds_taco_bench',
      'org_nordic_mrf',
      'TACO + MRF Conveyor Benchmark (Public Reference)',
      'v1.2-stratified',
      'MIT / CC-BY-4.0 (TACO Dataset)',
      'https://tacodataset.org/',
      '70% Train / 15% Val / 15% Test (Scene-Grouped, Zero Leakage)',
      1500,
      JSON.stringify({ PET_01: 280, ALUM_CAN: 220, OCC_CARD: 240, HDPE_02: 160, GLASS_CLR: 150, COMP_MLP: 190, PAPER_MIX: 140, BATT_LI: 45, TEXTILE: 75 }),
      'Public litter datasets over-represent uncrushed consumer packaging and under-represent high-speed MRF occlusion and compacted bales.'
    );

    db.prepare(`
      INSERT INTO datasets (id, organization_id, name, version_tag, license, provenance_url, split_strategy, sample_count, class_distribution_json, limitations_notes, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      'ds_gothenburg_corrected',
      'org_nordic_mrf',
      'Gothenburg Active-Learning Verified Corrections',
      'v0.4-curated',
      'Internal Organization Dataset',
      'internal://org_nordic_mrf/annotations',
      '80% Train / 20% Eval (Facility-Scoped)',
      142,
      JSON.stringify({ PET_01: 34, PP_05: 28, COMP_MLP: 31, OCC_CARD: 25, BATT_LI: 12, EWASTE_PCB: 12 }),
      'Curated exclusively from human-verified low-confidence predictions and operator escalations.'
    );

    const insertModel = db.prepare(`
      INSERT INTO ai_models (id, organization_id, name, architecture, provider_type, license, origin_source, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertModel.run('mdl_gemini_vision', 'org_nordic_mrf', 'SortSight Cloud Multimodal Vision', 'gemini-4-hydrogen (Structured Vision + Polygon)', 'gemini_cloud', 'Google Gemini API Terms', 'Google AI Studio Server-Side SDK');
    insertModel.run('mdl_edge_heuristic', 'org_nordic_mrf', 'SortSight Edge Local Heuristic Analyzer', 'Color-Texture-Edge Deterministic Pipeline', 'edge_heuristic', 'Apache-2.0 (Built-in)', 'Local Offline CPU Inference');
    insertModel.run('mdl_yolo_ref', 'org_nordic_mrf', 'YOLOv8-MRF Reference Architecture (Adapter)', 'YOLOv8n-seg ONNX Specification', 'yolo_reference', 'AGPL-3.0 / Ultralytics Adapter', 'Documented Edge ONNX Adapter (Requires External Weights)');

    const insertVer = db.prepare(`
      INSERT INTO model_versions (id, model_id, version_tag, dataset_id, training_mode, status, precision_score, recall_score, f1_score, calibration_ece, avg_latency_ms, confusion_matrix_json, class_metrics_json, edge_compatible, approved_by, approved_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertVer.run(
      'mver_gemini_1', 'mdl_gemini_vision', 'v2026.1-live', 'ds_taco_bench', 'pretrained', 'production',
      null, null, null, 0.041, 680,
      JSON.stringify({ note: 'Live multimodal zero-shot/structured inference; per-facility precision/recall computed dynamically from human review verifications.' }),
      JSON.stringify([]), 0, 'usr_admin', '2026-10-01T09:00:00Z',
      'Primary live vision provider. Never fabricates offline benchmark scores; tracks real verified precision from Human Review Center.'
    );
    insertVer.run(
      'mver_edge_1', 'mdl_edge_heuristic', 'v1.0-offline', 'ds_taco_bench', 'pretrained', 'staging',
      0.61, 0.58, 0.59, 0.095, 18,
      JSON.stringify({ labels: ['PET', 'Alum', 'Cardboard', 'Hazard'], matrix: [[38, 6, 4, 2], [7, 35, 3, 5], [4, 2, 40, 4], [5, 4, 3, 28]] }),
      JSON.stringify([
        { className: 'PET_01', precision: 0.70, recall: 0.76, f1: 0.73 },
        { className: 'ALUM_CAN', precision: 0.74, recall: 0.70, f1: 0.72 },
        { className: 'OCC_CARD', precision: 0.80, recall: 0.80, f1: 0.80 },
        { className: 'BATT_LI', precision: 0.72, recall: 0.56, f1: 0.63 },
      ]),
      1, 'usr_admin', '2026-10-05T10:30:00Z',
      'Offline-capable deterministic fallback analyzer tested on local 200-sample synthetic bench.'
    );

    // 8. Sorting Configurations & Conveyor Sessions
    db.prepare(`
      INSERT INTO sorting_configurations (id, organization_id, facility_id, name, is_active, min_confidence_auto_sort, max_contamination_pct, rules_json)
      VALUES (?, ?, ?, ?, 1, 0.72, 12.0, ?)
    `).run(
      'sort_cfg_got', 'org_nordic_mrf', 'fac_gothenburg', 'Gothenburg Main Line Optical Rules v3',
      JSON.stringify({
        hazardAutoStop: true,
        lowConfidenceRoute: 'chute_manual_qc',
        chutes: [
          { id: 'chute_pet_clear', label: 'Chute 1 · Clear PET Baler', materials: ['PET_01'], airJetPort: 1 },
          { id: 'chute_hdpe_rigid', label: 'Chute 2 · Rigid HDPE', materials: ['HDPE_02'], airJetPort: 2 },
          { id: 'chute_pp_mixed', label: 'Chute 3 · PP Rigid', materials: ['PP_05'], airJetPort: 3 },
          { id: 'chute_eddy_aluminum', label: 'Chute 4 · Eddy Aluminum', materials: ['ALUM_CAN'], airJetPort: 4 },
          { id: 'chute_fiber_occ', label: 'Chute 5 · Dry OCC Fiber', materials: ['OCC_CARD', 'PAPER_MIX'], airJetPort: 5 },
          { id: 'chute_manual_qc', label: 'QC Belt · Manual Verification', materials: ['UNKNOWN_OOD'], airJetPort: 6 },
          { id: 'chute_reject_residue', label: 'Reject · Residue / Multi-Layer', materials: ['COMP_MLP', 'PS_06', 'PVC_03'], airJetPort: 7 },
          { id: 'chute_hazard_firebox', label: 'QUARANTINE · Hazard / Battery', materials: ['BATT_LI', 'HAZ_CHEM', 'EWASTE_PCB'], airJetPort: 8 },
        ],
      })
    );

    db.prepare(`
      INSERT INTO conveyor_sessions (id, organization_id, facility_id, line_name, belt_speed_mps, status, mode, items_processed, items_diverted_reject)
      VALUES (?, ?, ?, ?, ?, 'paused', 'simulator', 1482, 164)
    `).run('conv_got_line1', 'org_nordic_mrf', 'fac_gothenburg', 'Optical Line A (Simulated PLC)', 1.85);

    // 9. Demo Detection Records + Objects + Contamination + Hazards + Reviews
    const dets = [
      { id: 'det_demo_1', fac: 'fac_gothenburg', src: 'upload', name: 'conveyor_frame_0482.png', prov: 'gemini_cloud', readiness: 86, recovery: 89, count: 3, haz: 0, rev: 0 },
      { id: 'det_demo_2', fac: 'fac_gothenburg', src: 'camera', name: 'infeed_hazard_check_091.png', prov: 'gemini_cloud', readiness: 24, recovery: 18, count: 2, haz: 1, rev: 1 },
      { id: 'det_demo_3', fac: 'fac_rotterdam', src: 'batch', name: 'packaging_audit_batch_12.png', prov: 'edge_heuristic', readiness: 62, recovery: 58, count: 2, haz: 0, rev: 1 },
    ];
    const insertDet = db.prepare(`
      INSERT INTO detection_records (id, organization_id, facility_id, user_id, source_type, image_name, inference_provider, model_version_id, inference_latency_ms, overall_readiness_score, overall_recovery_score, object_count, has_hazards, needs_human_review, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const d of dets) {
      insertDet.run(d.id, 'org_nordic_mrf', d.fac, 'usr_operator', d.src, d.name, d.prov, d.prov === 'gemini_cloud' ? 'mver_gemini_1' : 'mver_edge_1', d.prov === 'gemini_cloud' ? 620 : 19, d.readiness, d.recovery, d.count, d.haz, d.rev);
    }

    const insertObj = db.prepare(`
      INSERT INTO detection_objects (id, detection_record_id, organization_id, track_id, label, material_code, fine_grained_type, confidence, calibrated_confidence, is_low_confidence, is_unknown_material, bbox_json, explanation, visual_cues_json, recyclable_status, recyclability_reason, reuse_potential, packaging_type, is_multilayer, separation_advice, readiness_score, recovery_score, sorting_priority, recommended_chute)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertObj.run('obj_d1_1', 'det_demo_1', 'org_nordic_mrf', 'TRK-101', 'Clear PET Beverage Bottle', 'PET_01', 'Clear PET #1 Bottle (500ml)', 0.94, 0.92, 0, 0, JSON.stringify([120, 90, 410, 280]), 'Transparent polymer body with characteristic neck ring and blow-molded base.', JSON.stringify(['Transparent specular sheen', 'Threaded neck finish', 'Minimal residue']), 'recyclable', 'Accepted under Gothenburg Policy (PET_01 <= 8% contamination).', 'low', 'rigid_bottle', 0, 'Leave cap attached per Nordic MRF spec; keep dry.', 92, 95, 1, 'chute_pet_clear');
    insertObj.run('obj_d1_2', 'det_demo_1', 'org_nordic_mrf', 'TRK-102', 'Crushed Aluminum Can', 'ALUM_CAN', 'Aluminum Beverage Can (330ml)', 0.96, 0.94, 0, 0, JSON.stringify([150, 340, 390, 540]), 'Brushed metallic specular reflection with crimped rim geometry.', JSON.stringify(['Silver metallic luster', 'Stamped pull-tab rim']), 'recyclable', 'High-value non-ferrous stream recovered by Eddy Current separator.', 'low', 'metal_can', 0, 'No separation needed; keep out of glass cullet.', 96, 98, 1, 'chute_eddy_aluminum');
    insertObj.run('obj_d1_3', 'det_demo_1', 'org_nordic_mrf', 'TRK-103', 'Greasy Cardboard Box', 'OCC_CARD', 'Food-Soiled Corrugated Box', 0.81, 0.78, 0, 0, JSON.stringify([450, 120, 820, 610]), 'Corrugated flute edge visible, but dark oil saturation across 35% of inner panel.', JSON.stringify(['Kraft corrugated texture', 'Dark grease staining', 'Moisture softening']), 'conditional', 'Exceeds 5% contamination threshold due to visible food/oil saturation.', 'none', 'fiber_box', 0, 'Tear clean lid for OCC; send grease-soaked base to compost/reject.', 48, 42, 2, 'chute_reject_residue');

    insertObj.run('obj_d2_1', 'det_demo_2', 'org_nordic_mrf', 'TRK-201', 'Swollen Lithium-Ion Battery Pack', 'BATT_LI', 'Pouch Li-ion Cell (Damaged)', 0.91, 0.89, 0, 0, JSON.stringify([220, 260, 560, 580]), 'Rectangular silver/black pouch cell with visible swelling and foil tab terminals.', JSON.stringify(['Foil pouch casing', 'Swollen cell geometry', 'Warning icon surface']), 'hazardous', 'PROHIBITED in MRF baler/shredder: severe thermal runaway fire risk.', 'none', 'battery_cell', 1, 'DO NOT COMPACT. Isolate immediately in fire-rated sand/vermiculite drum.', 0, 0, 1, 'chute_hazard_firebox');
    insertObj.run('obj_d2_2', 'det_demo_2', 'org_nordic_mrf', 'TRK-202', 'Uncertain Rigid Polymer Fragment', 'UNKNOWN_OOD', 'Unmarked Dark Polymer Part', 0.52, 0.49, 1, 1, JSON.stringify([580, 620, 810, 870]), 'Low confidence (<0.65): dark carbon-black plastic absorbs NIR/optical contrast.', JSON.stringify(['Matte black surface', 'Ambiguous edge geometry']), 'unknown', 'Confidence below 0.65 threshold; escalated to Human Review Queue.', 'low', 'unknown_fragment', 0, 'Hold for manual inspection before routing.', 35, 25, 2, 'chute_manual_qc');

    insertObj.run('obj_d3_1', 'det_demo_3', 'org_nordic_mrf', 'TRK-301', 'Foil-Lined Multi-Layer Snack Pouch', 'COMP_MLP', 'Metallized BOPP/PET/Alu Laminate', 0.85, 0.82, 0, 0, JSON.stringify([140, 140, 480, 440]), 'Flexible crinkle reflections combined with aluminum inner barrier layer.', JSON.stringify(['Metallic inner lamination', 'Heat-sealed crimp edges']), 'non_recyclable', 'Multi-layer composite incompatible with mechanical mono-polymer recovery.', 'none', 'multi_layer_pouch', 1, 'Route to residue / energy recovery stream.', 28, 20, 3, 'chute_reject_residue');

    // Contamination & Hazard records
    db.prepare(`
      INSERT INTO contamination_records (id, organization_id, facility_id, detection_record_id, detection_object_id, contamination_type, severity, purity_estimate_pct, food_residue_detected, cross_material_detected, description, remediation_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cont_demo_1', 'org_nordic_mrf', 'fac_gothenburg', 'det_demo_1', 'obj_d1_3', 'Food Oil / Grease Saturation', 'high', 62.0, 1, 0, 'Visible cooking oil saturation covering ~35% of corrugated surface area.', 'Divert soiled section from OCC fiber bale to protect pulp quality.');

    db.prepare(`
      INSERT INTO hazard_alerts (id, organization_id, facility_id, detection_record_id, detection_object_id, hazard_type, severity, title, warning_message, isolation_recommendation, safe_handling_guidance, status, is_demo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1)
    `).run(
      'haz_demo_1', 'org_nordic_mrf', 'fac_gothenburg', 'det_demo_2', 'obj_d2_1',
      'lithium_battery', 'critical',
      'Lithium-Ion Battery Detected on Infeed',
      'Visible swollen pouch battery detected (confidence 0.91). Visual detection is NOT a chemical or charge-state verification; treat as energized fire hazard.',
      'Divert to Quarantine Firebox Chute 8 and halt downstream shredder/baler feed.',
      'Wear insulated PPE gloves, avoid puncturing or crushing, place inside dry sand/vermiculite containment drum, log hazmat pickup.',
    );

    // Human Review Queue
    db.prepare(`
      INSERT INTO human_reviews (id, organization_id, facility_id, detection_record_id, detection_object_id, trigger_reason, original_material_code, original_confidence, review_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run('rev_demo_1', 'org_nordic_mrf', 'fac_gothenburg', 'det_demo_2', 'obj_d2_2', 'Low confidence (0.52 < 0.65) + Unknown OOD material', 'UNKNOWN_OOD', 0.52);

    db.prepare(`
      INSERT INTO human_reviews (id, organization_id, facility_id, detection_record_id, detection_object_id, trigger_reason, original_material_code, original_confidence, corrected_material_code, corrected_recyclable_status, review_status, reviewer_user_id, reviewer_notes, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'corrected', 'usr_reviewer', 'Confirmed PP #5 black food tray via manual inspection.', '2026-11-12T14:20:00Z')
    `).run('rev_demo_2', 'org_nordic_mrf', 'fac_rotterdam', 'det_demo_3', 'obj_d3_1', 'Operator flagged multi-layer edge check', 'COMP_MLP', 0.85, 'COMP_MLP', 'non_recyclable');

    // 10. Processing Batches, Inventory, Operations Tasks
    const batches = [
      { id: 'bat_got_01', fac: 'fac_gothenburg', code: 'BATCH-SE-2026-1101', route: 'Gothenburg Sector North Curbside', intake: 4820, rec: 3910, cont: 410, status: 'sorting' },
      { id: 'bat_got_02', fac: 'fac_gothenburg', code: 'BATCH-SE-2026-1102', route: 'Industrial Commercial Packaging', intake: 6150, rec: 5490, cont: 290, status: 'completed' },
      { id: 'bat_rtm_01', fac: 'fac_rotterdam', code: 'BATCH-NL-2026-1104', route: 'Port Logistics Dry Fiber & Film', intake: 7400, rec: 6280, cont: 520, status: 'completed' },
    ];
    const insertBatch = db.prepare(`
      INSERT INTO processing_batches (id, organization_id, facility_id, batch_code, source_route, intake_weight_kg, recovered_weight_kg, contaminated_weight_kg, status, assigned_operator_id, is_demo_data)
      VALUES (?, 'org_nordic_mrf', ?, ?, ?, ?, ?, ?, ?, 'usr_operator', 1)
    `);
    for (const b of batches) {
      insertBatch.run(b.id, b.fac, b.code, b.route, b.intake, b.rec, b.cont, b.status);
    }

    const inv = [
      { fac: 'fac_gothenburg', mat: 'PET_01', bales: 18, kg: 8460, purity: 96.4, zone: 'Bay A1' },
      { fac: 'fac_gothenburg', mat: 'HDPE_02', bales: 11, kg: 5120, purity: 95.1, zone: 'Bay A2' },
      { fac: 'fac_gothenburg', mat: 'ALUM_CAN', bales: 9, kg: 3950, purity: 98.2, zone: 'Bay B1' },
      { fac: 'fac_gothenburg', mat: 'OCC_CARD', bales: 26, kg: 14200, purity: 93.8, zone: 'Bay C1' },
      { fac: 'fac_rotterdam', mat: 'PET_01', bales: 24, kg: 11400, purity: 95.8, zone: 'Dock 3' },
    ];
    const insertInv = db.prepare(`
      INSERT INTO material_inventory (id, organization_id, facility_id, material_code, bale_count, weight_kg, avg_purity_pct, storage_zone)
      VALUES (?, 'org_nordic_mrf', ?, ?, ?, ?, ?, ?)
    `);
    inv.forEach((item, idx) => insertInv.run(`inv_demo_${idx + 1}`, item.fac, item.mat, item.bales, item.kg, item.purity, item.zone));

    db.prepare(`
      INSERT INTO operations_tasks (id, organization_id, facility_id, title, description, priority, status, assigned_to_user_id, created_by_user_id, due_date)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, ?, 'urgent', 'open', 'usr_operator', 'usr_manager', '2026-11-14')
    `).run('tsk_demo_1', 'Isolate Li-ion Battery from Infeed Line A', 'Verify haz_demo_1 quarantine drum placement and inspect pre-sort belt sensor.');

    db.prepare(`
      INSERT INTO operations_tasks (id, organization_id, facility_id, title, description, priority, status, assigned_to_user_id, created_by_user_id, due_date)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, ?, 'medium', 'in_progress', 'usr_reviewer', 'usr_manager', '2026-11-15')
    `).run('tsk_demo_2', 'Audit OCC Moisture & Grease Reject Rate', 'Review 12 flagged fiber frames from BATCH-SE-2026-1101 before baling.');

    // 11. Historical Analytics Snapshots (Clearly marked Demo Data)
    const snapshots = [
      { id: 'snp_1', fac: 'fac_gothenburg', dt: '2026-11-08', items: 1120, rec: 79.2, cont: 11.4, acc: 91.5, tons: 142.0 },
      { id: 'snp_2', fac: 'fac_gothenburg', dt: '2026-11-09', items: 1245, rec: 80.6, cont: 10.8, acc: 92.1, tons: 156.4 },
      { id: 'snp_3', fac: 'fac_gothenburg', dt: '2026-11-10', items: 1190, rec: 81.4, cont: 9.9, acc: 92.8, tons: 149.2 },
      { id: 'snp_4', fac: 'fac_gothenburg', dt: '2026-11-11', items: 1380, rec: 82.9, cont: 9.2, acc: 93.4, tons: 168.5 },
      { id: 'snp_5', fac: 'fac_gothenburg', dt: '2026-11-12', items: 1420, rec: 83.5, cont: 8.7, acc: 94.0, tons: 174.1 },
      { id: 'snp_6', fac: 'fac_gothenburg', dt: '2026-11-13', items: 1482, rec: 84.2, cont: 8.4, acc: 94.3, tons: 179.8 },
      { id: 'snp_7', fac: 'fac_rotterdam', dt: '2026-11-12', items: 1840, rec: 85.1, cont: 7.9, acc: 94.6, tons: 221.0 },
      { id: 'snp_8', fac: 'fac_rotterdam', dt: '2026-11-13', items: 1910, rec: 85.8, cont: 7.5, acc: 94.9, tons: 229.4 },
    ];
    const insertSnap = db.prepare(`
      INSERT INTO analytics_snapshots (id, organization_id, facility_id, snapshot_date, total_items_scanned, recovery_rate_pct, contamination_rate_pct, sorting_accuracy_pct, throughput_tons, is_demo_data)
      VALUES (?, 'org_nordic_mrf', ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const s of snapshots) {
      insertSnap.run(s.id, s.fac, s.dt, s.items, s.rec, s.cont, s.acc, s.tons);
    }

    // 12. Digital Twin Config & Baseline Simulation
    const twinStages = [
      { id: 'stg_infeed', name: 'Infeed Hopper & Metering Drum', capacityTph: 18, currentLoadTph: 14.5, contaminationRisk: 0.18, recoveryEff: 0.99 },
      { id: 'stg_presort', name: 'Pre-Sort Cabin (Hazards & Textiles)', capacityTph: 18, currentLoadTph: 14.2, contaminationRisk: 0.24, recoveryEff: 0.94 },
      { id: 'stg_trommel', name: 'Ballistic & OCC Star Screen', capacityTph: 16, currentLoadTph: 13.4, contaminationRisk: 0.12, recoveryEff: 0.91 },
      { id: 'stg_nir1', name: 'NIR Optical Sorter (PET / HDPE / PP)', capacityTph: 12, currentLoadTph: 9.8, contaminationRisk: 0.08, recoveryEff: 0.95 },
      { id: 'stg_eddy', name: 'Overband Magnet & Eddy Current', capacityTph: 10, currentLoadTph: 4.1, contaminationRisk: 0.04, recoveryEff: 0.97 },
      { id: 'stg_qc', name: 'AI Vision QC & Robotic Pick', capacityTph: 8, currentLoadTph: 5.2, contaminationRisk: 0.06, recoveryEff: 0.96 },
      { id: 'stg_baler', name: 'Two-Ram Automated Baler', capacityTph: 15, currentLoadTph: 11.6, contaminationRisk: 0.03, recoveryEff: 0.99 },
    ];
    db.prepare(`
      INSERT INTO digital_twin_configs (id, organization_id, facility_id, name, stages_json)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, ?)
    `).run('twin_got_1', 'Gothenburg Line A 7-Stage MRF Twin', JSON.stringify(twinStages));

    // 13. Simulated Industrial Integration Devices (Clearly marked simulator)
    const devices = [
      { id: 'dev_plc_1', name: 'Siemens S7-1500 Line A PLC (SIMULATED)', type: 'plc_controller', proto: 'OPC-UA / Modbus-TCP Simulator', uri: 'sim://plc-gothenburg-line-a:4840' },
      { id: 'dev_rob_1', name: 'Delta-Pick 4-Axis Sorting Arm (SIMULATED)', type: 'robotic_arm', proto: 'REST Webhook + gRPC Stub', uri: 'sim://robot-pick-station-2:8085' },
      { id: 'dev_cam_1', name: 'Basler GigE Line-Scan Overhead Cam (SIMULATED)', type: 'industrial_camera', proto: 'GenICam / RTSP Frame Simulator', uri: 'sim://cam-gige-infeed-01' },
      { id: 'dev_edge_1', name: 'Jetson Orin NX Edge Node #1 (LOCAL ADAPTER)', type: 'edge_jetson', proto: 'ONNX Runtime Edge Bridge', uri: 'local://edge-heuristic-v1' },
    ];
    const insertDev = db.prepare(`
      INSERT INTO integration_devices (id, organization_id, facility_id, name, device_type, protocol, endpoint_uri, connection_mode, last_heartbeat_at)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, ?, ?, ?, 'simulator', datetime('now'))
    `);
    for (const dev of devices) {
      insertDev.run(dev.id, dev.name, dev.type, dev.proto, dev.uri);
    }

    // 14. Webhook & Notifications & Audit Seed
    db.prepare(`
      INSERT INTO webhooks (id, organization_id, name, target_url, events_json, encrypted_secret, is_active)
      VALUES (?, 'org_nordic_mrf', ?, ?, ?, ?, 1)
    `).run(
      'wh_demo_1',
      'Facility SCADA Hazard Dispatch (Demo Target)',
      'https://example.invalid/hooks/sortsight-hazards',
      JSON.stringify(['hazard.detected', 'review.escalated', 'batch.completed']),
      encryptSecret('demo_webhook_signing_secret_only')
    );

    db.prepare(`
      INSERT INTO notifications (id, organization_id, user_id, facility_id, channel, severity, status, group_key, occurrence_count, title, message)
      VALUES (?, 'org_nordic_mrf', 'usr_admin', 'fac_gothenburg', 'in_app', 'critical', 'open', 'hazard:lithium_battery:fac_gothenburg', 1, 'Critical Hazard: Lithium-Ion Cell Flagged', 'Gothenburg Optical MRF #1 flagged a swollen Li-ion battery on Infeed Line A (haz_demo_1).')
    `).run('notif_demo_1');

    db.prepare(`
      INSERT INTO notifications (id, organization_id, user_id, facility_id, channel, severity, status, group_key, occurrence_count, title, message)
      VALUES (?, 'org_nordic_mrf', 'usr_reviewer', 'fac_gothenburg', 'in_app', 'warning', 'open', 'review:low_confidence:fac_gothenburg', 2, 'Human Review Required', 'Low-confidence polymer objects (<0.65) are waiting in the QA Review Queue.')
    `).run('notif_demo_2');

    // 15. Saved Dashboard Views & Shift Handovers (Demo Seed)
    db.prepare(`
      INSERT INTO saved_dashboard_views (id, organization_id, user_id, name, description, config_json, is_shared, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'usr_admin', ?, ?, ?, 1, 1)
    `).run(
      'view_demo_exec',
      'Nordic Executive 30-Day View',
      'All Gothenburg & Rotterdam facilities with 30-day recovery & hazard watch.',
      JSON.stringify({ facilityId: '', timeRange: '30d', focusArea: 'executive' })
    );

    db.prepare(`
      INSERT INTO saved_dashboard_views (id, organization_id, user_id, name, description, config_json, is_shared, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'usr_manager', ?, ?, ?, 1, 1)
    `).run(
      'view_demo_got_ops',
      'Gothenburg Line A Contamination Watch',
      'Focused on Gothenburg Optical MRF #1 last 7 days throughput and QA alerts.',
      JSON.stringify({ facilityId: 'fac_gothenburg', timeRange: '7d', focusArea: 'contamination' })
    );

    db.prepare(`
      INSERT INTO shift_handovers (id, organization_id, facility_id, shift_label, outgoing_user_id, outgoing_user_name, incoming_user_name, summary_notes, safety_notes, conveyor_status_snapshot, open_hazards_count, pending_reviews_count, items_processed_count, status, signed_off_by_user_id, signed_off_by_name, signed_off_at, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, 'usr_operator', 'Kenji Takahashi', 'Henrik Vermeer', ?, ?, 'running', 0, 1, 1420, 'acknowledged', 'usr_manager', 'Henrik Vermeer', '2026-11-13T06:12:00Z', 1)
    `).run(
      'hand_demo_1',
      'Night Shift C (22:00 – 06:00)',
      'Processed 1,420 optical detections across PET #1 and OCC Fiber streams. Chute 5 star screen cleared at 03:40.',
      'No thermal incidents; overhead magnet cleared of ferrous strapping.'
    );

    db.prepare(`
      INSERT INTO shift_handovers (id, organization_id, facility_id, shift_label, outgoing_user_id, outgoing_user_name, incoming_user_name, summary_notes, safety_notes, conveyor_status_snapshot, open_hazards_count, pending_reviews_count, items_processed_count, status, is_demo_data)
      VALUES (?, 'org_nordic_mrf', 'fac_gothenburg', ?, 'usr_operator', 'Kenji Takahashi', 'Elena Rostova', ?, ?, 'paused', 1, 1, 1482, 'submitted', 1)
    `).run(
      'hand_demo_2',
      'Morning Shift A (06:00 – 14:00)',
      'Line A paused after swollen Li-ion battery alert (haz_demo_1) on infeed belt; 1,482 cumulative frames logged.',
      'CRITICAL: Verify Quarantine Firebox Chute 8 drum seal before resuming Optical Line A.'
    );

    db.prepare(`
      INSERT INTO audit_logs (id, organization_id, user_id, actor_email, action, resource_type, resource_id, details_json)
      VALUES (?, 'org_nordic_mrf', 'usr_admin', 'admin@sortsight.demo', 'system.demo_seeded', 'organization', 'org_nordic_mrf', ?)
    `).run('aud_demo_1', JSON.stringify({ note: 'Initialized SortSight AI demo tenant environment' }));
  });

  tx();
}
