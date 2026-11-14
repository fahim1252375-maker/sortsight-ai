import * as THREE from 'three';

export type Material3DCode =
  | 'PET_01'
  | 'HDPE_02'
  | 'ALUM_CAN'
  | 'STEEL_FE'
  | 'GLASS_CLR'
  | 'OCC_CARD'
  | 'EWASTE_PCB';

export interface Material3DSpec {
  code: Material3DCode;
  name: string;
  resinOrCode: string;
  chute: string;
  density: string;
  opticalSignature: string;
  accentHex: string;
  dimensions: string;
}

export const MATERIAL_3D_SPECS: Record<Material3DCode, Material3DSpec> = {
  PET_01: {
    code: 'PET_01',
    name: 'Clear PET Beverage Bottle',
    resinOrCode: 'SPI #1 · Polyethylene Terephthalate',
    chute: 'chute_pet_clear',
    density: '1.38 g/cm³',
    opticalSignature: '1660 nm NIR absorption peak',
    accentHex: '#10b981',
    dimensions: '215 × 68 mm',
  },
  HDPE_02: {
    code: 'HDPE_02',
    name: 'Natural/Pigmented HDPE Jug',
    resinOrCode: 'SPI #2 · High-Density Polyethylene',
    chute: 'chute_hdpe_rigid',
    density: '0.95 g/cm³',
    opticalSignature: '1215 nm & 1730 nm doublet',
    accentHex: '#0ea5e9',
    dimensions: '240 × 115 mm',
  },
  ALUM_CAN: {
    code: 'ALUM_CAN',
    name: 'UBC Aluminum Beverage Can',
    resinOrCode: 'ALU 41 · Non-Ferrous Alloy',
    chute: 'chute_eddy_aluminum',
    density: '2.70 g/cm³',
    opticalSignature: 'Eddy-current repulsion + high specular',
    accentHex: '#38bdf8',
    dimensions: '122 × 66 mm',
  },
  STEEL_FE: {
    code: 'STEEL_FE',
    name: 'Ferrous Tinplate Food Can',
    resinOrCode: 'FE 40 · Magnetic Steel',
    chute: 'chute_ferrous_magnet',
    density: '7.85 g/cm³',
    opticalSignature: 'Overhead cross-belt magnet capture',
    accentHex: '#94a3b8',
    dimensions: '110 × 74 mm',
  },
  GLASS_CLR: {
    code: 'GLASS_CLR',
    name: 'Cullet Glass Bottle',
    resinOrCode: 'GL 70-71 · Soda-Lime Glass',
    chute: 'chute_glass_cullet',
    density: '2.52 g/cm³',
    opticalSignature: 'Vis-transmission refraction & weight profile',
    accentHex: '#2dd4bf',
    dimensions: '230 × 72 mm',
  },
  OCC_CARD: {
    code: 'OCC_CARD',
    name: 'Corrugated Cardboard (OCC)',
    resinOrCode: 'PAP 20 · Kraft Cellulose Fiber',
    chute: 'chute_fiber_occ',
    density: '0.68 g/cm³',
    opticalSignature: '1540 nm cellulose reflectance + ballistic air-knife',
    accentHex: '#d97706',
    dimensions: '320 × 240 × 180 mm',
  },
  EWASTE_PCB: {
    code: 'EWASTE_PCB',
    name: 'WEEE Printed Circuit Assembly',
    resinOrCode: 'WEEE Cat-4 · FR-4 + Au/Cu/Sn',
    chute: 'chute_ewaste_manual',
    density: '1.85 g/cm³',
    opticalSignature: 'RGB dense component grid + solder-mask spectrum',
    accentHex: '#a855f7',
    dimensions: '160 × 110 × 18 mm',
  },
};

export function isSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return false;
    const str = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe/i.test(str);
  } catch {
    return false;
  }
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.dispose();
        if (std.roughnessMap) std.roughnessMap.dispose();
        if (std.bumpMap) std.bumpMap.dispose();
        m.dispose();
      }
    }
  });
}

function makeLabelTexture(bgColor: string, fgColor: string, line1: string, line2: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  ctx.fillStyle = fgColor;
  ctx.font = 'bold 42px Inter, system-ui, sans-serif';
  ctx.fillText(line1, 34, 86);
  ctx.font = '600 26px ui-monospace, monospace';
  ctx.fillText(line2, 34, 138);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeBeltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#18212f';
  ctx.fillRect(0, 0, 256, 256);

  // Textured rubber cleats + center guide chevrons
  ctx.fillStyle = '#253247';
  for (let y = 0; y < 256; y += 32) {
    ctx.fillRect(0, y, 256, 7);
  }
  ctx.strokeStyle = '#10b981';
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 3;
  for (let y = 16; y < 256; y += 64) {
    ctx.beginPath();
    ctx.moveTo(96, y + 14);
    ctx.lineTo(128, y);
    ctx.lineTo(160, y + 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 5);
  return tex;
}

function makeCardboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b98957';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle corrugated fiber lines
  ctx.fillStyle = 'rgba(72, 42, 16, 0.14)';
  for (let y = 0; y < 512; y += 8) {
    ctx.fillRect(0, y, 512, 2);
  }

  // Industrial OCC Stamp
  ctx.strokeStyle = '#3a2310';
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, 220, 120);
  ctx.fillStyle = '#3a2310';
  ctx.font = 'bold 42px ui-monospace, monospace';
  ctx.fillText('OCC PAP20', 64, 108);
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText('RECOVERABLE FIBER', 64, 146);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a multi-part composite THREE.Group for any of the 7 recyclable material models.
 */
export function buildMaterialModel(code: Material3DCode, scale = 1): THREE.Group {
  const group = new THREE.Group();
  group.name = `material_${code}`;

  if (code === 'PET_01') {
    const profile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.28, 0.0),
      new THREE.Vector2(0.32, 0.08),
      new THREE.Vector2(0.32, 0.72),
      new THREE.Vector2(0.28, 0.78),
      new THREE.Vector2(0.31, 0.86),
      new THREE.Vector2(0.24, 1.05),
      new THREE.Vector2(0.11, 1.24),
      new THREE.Vector2(0.11, 1.38),
      new THREE.Vector2(0.0, 1.38),
    ];
    const bodyGeo = new THREE.LatheGeometry(profile, 32);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8f5ff,
      roughness: 0.08,
      metalness: 0.02,
      transmission: 0.65,
      transparent: true,
      opacity: 0.82,
      ior: 1.54,
      thickness: 0.35,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.118, 0.018, 12, 28),
      new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.35 })
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.28;
    group.add(collar);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.125, 0.14, 24),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.38, metalness: 0.05 })
    );
    cap.position.y = 1.39;
    cap.castShadow = true;
    group.add(cap);

    const labelTex = makeLabelTexture('#0f172a', '#34d399', 'PET #1 CLEAR', 'OPTICAL GRADE');
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.328, 0.328, 0.36, 32, 1, true),
      new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.45, side: THREE.DoubleSide })
    );
    label.position.y = 0.44;
    group.add(label);
  } else if (code === 'HDPE_02') {
    const jugMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.48, metalness: 0.02 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.92, 0.48), jugMat);
    base.position.y = 0.46;
    base.castShadow = true;
    group.add(base);

    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 0.34, 20), jugMat);
    shoulder.position.set(-0.08, 1.08, 0);
    shoulder.castShadow = true;
    group.add(shoulder);

    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.055, 12, 24, Math.PI),
      jugMat
    );
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(0.31, 0.68, 0);
    handle.castShadow = true;
    group.add(handle);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.15, 0.14, 20),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35 })
    );
    cap.position.set(-0.08, 1.3, 0);
    group.add(cap);

    const bandTex = makeLabelTexture('#0284c7', '#f8fafc', 'HDPE #2', 'HIGH DENSITY POLY');
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.695, 0.32, 0.495),
      new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.42 })
    );
    band.position.y = 0.48;
    group.add(band);
  } else if (code === 'ALUM_CAN') {
    const labelTex = makeLabelTexture('#0c4a6e', '#38bdf8', 'ALUM UBC', 'EDDY TARGET');
    const canBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.88, 32),
      new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.24, metalness: 0.85 })
    );
    canBody.position.y = 0.5;
    canBody.castShadow = true;
    group.add(canBody);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.18, metalness: 0.94 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.1, 32), metalMat);
    neck.position.y = 0.99;
    group.add(neck);

    const baseDome = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.08, 32), metalMat);
    baseDome.position.y = 0.04;
    group.add(baseDome);

    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 12, 32), metalMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 1.04;
    group.add(lip);

    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.18), metalMat);
    tab.position.set(0.03, 1.05, 0.02);
    group.add(tab);
  } else if (code === 'STEEL_FE') {
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.32, metalness: 0.88 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.92, 32), steelMat);
    body.position.y = 0.46;
    body.castShadow = true;
    group.add(body);

    // Corrugated tin ribs
    for (const ry of [0.22, 0.36, 0.5, 0.64, 0.78]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.322, 0.016, 10, 32), steelMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = ry;
      group.add(rib);
    }

    const seamTop = new THREE.Mesh(
      new THREE.TorusGeometry(0.322, 0.024, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.28, metalness: 0.92 })
    );
    seamTop.rotation.x = Math.PI / 2;
    seamTop.position.y = 0.92;
    group.add(seamTop);
  } else if (code === 'GLASS_CLR') {
    const profile = [
      new THREE.Vector2(0.0, 0.04),
      new THREE.Vector2(0.29, 0.0),
      new THREE.Vector2(0.32, 0.08),
      new THREE.Vector2(0.32, 0.68),
      new THREE.Vector2(0.24, 0.9),
      new THREE.Vector2(0.11, 1.12),
      new THREE.Vector2(0.11, 1.44),
      new THREE.Vector2(0.13, 1.47),
      new THREE.Vector2(0.0, 1.47),
    ];
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x34d399,
      roughness: 0.06,
      metalness: 0.05,
      transmission: 0.72,
      transparent: true,
      opacity: 0.85,
      ior: 1.52,
    });
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), glassMat);
    bottle.castShadow = true;
    group.add(bottle);

    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.145, 0.08, 18),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.75 })
    );
    crown.position.y = 1.49;
    group.add(crown);
  } else if (code === 'OCC_CARD') {
    const cardTex = makeCardboardTexture();
    const boxMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.84, metalness: 0.02 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.68, 0.72), boxMat);
    box.position.y = 0.34;
    box.castShadow = true;
    group.add(box);

    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.05 });
    const tapeTop = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.015, 0.16), tapeMat);
    tapeTop.position.y = 0.686;
    group.add(tapeTop);

    const flapLeft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.03, 0.72), boxMat);
    flapLeft.position.set(-0.23, 0.695, 0);
    flapLeft.rotation.z = 0.06;
    group.add(flapLeft);
  } else if (code === 'EWASTE_PCB') {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.05, 0.76),
      new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.42, metalness: 0.18 })
    );
    board.position.y = 0.12;
    board.castShadow = true;
    group.add(board);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.92 });
    const edgePins = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.055, 0.08), goldMat);
    edgePins.position.set(0, 0.12, 0.39);
    group.add(edgePins);

    const icMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.1 });
    const mainIc = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.32), icMat);
    mainIc.position.set(-0.12, 0.17, -0.05);
    mainIc.castShadow = true;
    group.add(mainIc);

    const heatsink = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.12, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.28, metalness: 0.85 })
    );
    heatsink.position.set(-0.12, 0.24, -0.05);
    group.add(heatsink);

    const capMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.6 });
    for (const [cx, cz] of [
      [0.32, -0.2],
      [0.32, 0.02],
      [0.32, 0.2],
    ]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 16), capMat);
      cap.position.set(cx, 0.23, cz);
      cap.castShadow = true;
      group.add(cap);
    }
  }

  group.scale.setScalar(scale);
  return group;
}

/**
 * Builds an industrial conveyor bed + stainless frame + side guide rails + return rollers.
 */
export function buildConveyorAssembly(length = 12, width = 2.1): {
  group: THREE.Group;
  beltMaterial: THREE.MeshStandardMaterial;
  beltTexture: THREE.CanvasTexture;
} {
  const group = new THREE.Group();
  const beltTexture = makeBeltTexture();
  beltTexture.repeat.set(1, Math.max(3, Math.round(length * 0.7)));

  const beltMaterial = new THREE.MeshStandardMaterial({
    map: beltTexture,
    roughness: 0.78,
    metalness: 0.12,
  });

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.78 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35, metalness: 0.4 });

  // Main belt top deck
  const belt = new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, width), beltMaterial);
  belt.position.y = 0.02;
  belt.receiveShadow = true;
  group.add(belt);

  // Side chassis beams
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(length + 0.3, 0.34, 0.16), frameMat);
    beam.position.set(0, -0.05, side * (width / 2 + 0.09));
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);

    // Stainless guide rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.06), railMat);
    rail.position.set(0, 0.26, side * (width / 2 + 0.03));
    group.add(rail);
  }

  // End drive drums
  for (const endX of [-length / 2, length / 2]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, width + 0.24, 24), railMat);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(endX, -0.02, 0);
    group.add(drum);
  }

  // Support legs
  const legCount = Math.max(3, Math.floor(length / 3.2));
  for (let i = 0; i < legCount; i++) {
    const x = -length / 2 + 1.0 + (i * (length - 2.0)) / Math.max(1, legCount - 1);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.35, 0.14), frameMat);
      leg.position.set(x, -0.82, side * (width / 2 + 0.09));
      leg.castShadow = true;
      group.add(leg);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, width + 0.18), accentMat);
    cross.position.set(x, -0.95, 0);
    group.add(cross);
  }

  return { group, beltMaterial, beltTexture };
}

/**
 * Builds an overhead NIR Optical Scanner Gantry + Dual Industrial Cameras + Emitter Beam Plane.
 */
export function buildOpticalGantry(width = 2.6): {
  group: THREE.Group;
  scanBeam: THREE.Mesh;
  statusLed: THREE.Mesh;
} {
  const group = new THREE.Group();
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.32, metalness: 0.72 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.3, metalness: 0.85 });

  // Vertical pillars
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.5, 0.26), housingMat);
    pillar.position.set(0, 0.9, side * (width / 2 + 0.15));
    pillar.castShadow = true;
    group.add(pillar);
  }

  // Overhead hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.56, width + 0.58), housingMat);
  hood.position.set(0, 2.05, 0);
  hood.castShadow = true;
  group.add(hood);

  // Dual high-speed RGB/NIR camera optics pods
  for (const zOff of [-0.48, 0.48]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.28, 20), trimMat);
    pod.position.set(0, 1.66, zOff);
    group.add(pod);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.04, 20),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.4, emissive: 0x0369a1, emissiveIntensity: 0.6 })
    );
    lens.position.set(0, 1.51, zOff);
    group.add(lens);
  }

  // Status indicator bar
  const statusLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.08, width * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 1.4, roughness: 0.2 })
  );
  statusLed.position.set(0.58, 2.08, 0);
  group.add(statusLed);

  // Translucent emerald NIR scan curtain
  const scanBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.55, width * 0.88),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scanBeam.position.set(0, 0.92, 0);
  group.add(scanBeam);

  return { group, scanBeam, statusLed };
}

/**
 * Builds an articulated delta / gantry robotic pick arm alongside the belt.
 */
export function buildRoboticPicker(): {
  group: THREE.Group;
  upperArm: THREE.Group;
  foreArm: THREE.Group;
} {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.78 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.45 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3, metalness: 0.5 });

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.0, 24), baseMat);
  pedestal.position.y = 0.5;
  pedestal.castShadow = true;
  group.add(pedestal);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.28, 20), accentMat);
  turret.position.y = 1.12;
  group.add(turret);

  const upperArm = new THREE.Group();
  upperArm.position.set(0, 1.25, 0);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), armMat);
  boom.position.set(0, 0.52, 0);
  boom.castShadow = true;
  upperArm.add(boom);

  const foreArm = new THREE.Group();
  foreArm.position.set(0, 1.04, 0);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), armMat);
  stick.position.set(0, -0.45, 0.32);
  stick.rotation.x = 0.52;
  stick.castShadow = true;
  foreArm.add(stick);

  const gripper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.18, 16), accentMat);
  gripper.position.set(0, -0.84, 0.58);
  foreArm.add(gripper);

  upperArm.add(foreArm);
  group.add(upperArm);

  return { group, upperArm, foreArm };
}
