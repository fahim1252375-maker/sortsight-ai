import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Pause, Play, RotateCcw, ScanLine } from 'lucide-react';
import {
  buildConveyorAssembly,
  buildMaterialModel,
  buildOpticalGantry,
  buildRoboticPicker,
  disposeObject3D,
  isSoftwareWebGL,
  Material3DCode,
} from './industrialProcedural';
import { WebGLFallbackBoundary } from './WebGLFallbackBoundary';

interface HeroItem {
  code: Material3DCode;
  label: string;
  confidence: string;
  chute: string;
  x: number;
  z: number;
  mesh: THREE.Group;
  bboxHelper: THREE.LineSegments;
  scanned: boolean;
}

interface FloatingPin {
  id: string;
  label: string;
  confidence: string;
  chute: string;
  leftPct: number;
  topPct: number;
  active: boolean;
}

interface FacilityHero3DProps {
  heightClass?: string;
}

function HeroSceneCanvas({
  paused,
  resetNonce,
  onPinsUpdate,
}: {
  paused: boolean;
  resetNonce: number;
  onPinsUpdate: (pins: FloatingPin[]) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onPinsRef = useRef(onPinsUpdate);
  onPinsRef.current = onPinsUpdate;
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const width = el.clientWidth || 720;
    const height = el.clientHeight || 460;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    const soft = isSoftwareWebGL(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, soft ? 1 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !soft;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b14);
    scene.fog = new THREE.FogExp2(0x060b14, 0.036);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(7.4, 5.2, 8.6);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0.2, 0.85, 0);
    controls.minDistance = 5.5;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.enablePan = false;
    controlsRef.current = controls;

    // Industrial warehouse floor + subtle grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.85, metalness: 0.15 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(32, 32, 0x1e293b, 0x131c2e);
    grid.position.y = -1.49;
    scene.add(grid);

    // Three-point industrial facility lighting
    scene.add(new THREE.HemisphereLight(0xcbd5e1, 0x090d16, 0.55));
    const keyLight = new THREE.DirectionalLight(0xf8fafc, 1.8);
    keyLight.position.set(7, 11, 6);
    keyLight.castShadow = !soft;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);

    const emeraldFill = new THREE.PointLight(0x10b981, 4.5, 16);
    emeraldFill.position.set(-0.6, 2.5, 0);
    scene.add(emeraldFill);

    const cyanRim = new THREE.DirectionalLight(0x38bdf8, 0.9);
    cyanRim.position.set(-8, 4, -6);
    scene.add(cyanRim);

    // Main Conveyor Assembly
    const { group: conveyorGroup, beltTexture } = buildConveyorAssembly(13.5, 2.2);
    scene.add(conveyorGroup);

    // Overhead Optical Scanner Gantry at x = -0.6
    const { group: gantryGroup, scanBeam } = buildOpticalGantry(2.5);
    gantryGroup.position.set(-0.6, 0, 0);
    scene.add(gantryGroup);

    // Robotic Delta Picker at x = 3.2
    const { group: robotGroup, upperArm, foreArm } = buildRoboticPicker();
    robotGroup.position.set(3.2, -1.5, -1.75);
    scene.add(robotGroup);

    // Recovery Chutes & Storage Bins along conveyor
    const binColors = [0x10b981, 0x0ea5e9, 0xf59e0b, 0x64748b];
    const binPositions = [1.8, 3.6, 5.2, -4.6];
    for (let i = 0; i < binPositions.length; i++) {
      const sideZ = i === 3 ? -2.1 : 2.15;
      const bin = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.35, 1.25),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.48, metalness: 0.65 })
      );
      bin.position.set(binPositions[i], -0.82, sideZ);
      bin.castShadow = true;
      bin.receiveShadow = true;
      scene.add(bin);

      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.32, 0.14, 1.27),
        new THREE.MeshStandardMaterial({ color: binColors[i], roughness: 0.35, emissive: binColors[i], emissiveIntensity: 0.35 })
      );
      stripe.position.set(binPositions[i], -0.22, sideZ);
      scene.add(stripe);

      // Chute diverter arm
      const chute = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.22, 0.85),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.8 })
      );
      chute.position.set(binPositions[i], 0.14, sideZ > 0 ? 1.22 : -1.22);
      chute.rotation.x = sideZ > 0 ? 0.35 : -0.35;
      scene.add(chute);
    }

    // Moving Recyclable Items with Dynamic Bounding Boxes
    const defs: Array<{ code: Material3DCode; label: string; conf: string; chute: string; x: number; z: number }> = [
      { code: 'PET_01', label: 'PET #1 Clear', conf: '94.8%', chute: 'Chute 1', x: -5.2, z: -0.35 },
      { code: 'ALUM_CAN', label: 'Alum UBC', conf: '96.2%', chute: 'Eddy 4', x: -2.4, z: 0.32 },
      { code: 'OCC_CARD', label: 'OCC Fiber', conf: '91.4%', chute: 'Fiber 3', x: 0.3, z: -0.1 },
      { code: 'HDPE_02', label: 'HDPE #2 Jug', conf: '92.7%', chute: 'Chute 2', x: 2.9, z: 0.28 },
      { code: 'GLASS_CLR', label: 'Glass Cullet', conf: '89.5%', chute: 'Cullet 5', x: 5.1, z: -0.32 },
    ];

    const items: HeroItem[] = defs.map((d) => {
      const mesh = buildMaterialModel(d.code, 0.56);
      mesh.position.set(d.x, 0.1, d.z);
      scene.add(mesh);

      const boxGeo = new THREE.BoxGeometry(0.82, 0.88, 0.82);
      const edges = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const bboxHelper = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.85 })
      );
      bboxHelper.position.set(d.x, 0.52, d.z);
      bboxHelper.visible = false;
      scene.add(bboxHelper);

      return {
        code: d.code,
        label: d.label,
        confidence: d.conf,
        chute: d.chute,
        x: d.x,
        z: d.z,
        mesh,
        bboxHelper,
        scanned: d.x > -0.6,
      };
    });

    // Subtle atmospheric particles (optical laser dust)
    const particleCount = 110;
    const pPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 16;
      pPositions[i * 3 + 1] = Math.random() * 4.5 - 0.5;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({ color: 0x34d399, size: 0.045, transparent: true, opacity: 0.45 })
    );
    scene.add(particles);

    const onContextLost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(180, entry.contentRect.width);
        const h = Math.max(180, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(el);

    const projVec = new THREE.Vector3();
    let rafId = 0;
    let elapsed = 0;
    let lastTime = performance.now();
    let frameCounter = 0;

    const tick = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!pausedRef.current) {
        elapsed += delta;
        beltTexture.offset.y -= delta * 0.65;

        // Sweep optical scan curtain subtly
        scanBeam.position.z = Math.sin(elapsed * 3.8) * 0.14;
        (scanBeam.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(elapsed * 4.5)) * 0.18;

        // Articulated robotic arm pick motion
        upperArm.rotation.y = Math.sin(elapsed * 1.6) * 0.55;
        upperArm.rotation.x = Math.sin(elapsed * 3.2) * 0.16;
        foreArm.rotation.x = 0.25 + Math.cos(elapsed * 3.2) * 0.22;

        // Move items along conveyor
        for (const item of items) {
          item.x += delta * 1.45;
          if (item.x > 6.2) {
            item.x = -6.2;
            item.scanned = false;
          }
          if (item.x > -0.7 && item.x < 2.2) {
            item.scanned = true;
          }
          item.mesh.position.x = item.x;
          item.mesh.rotation.y += delta * 0.3;

          item.bboxHelper.position.x = item.x;
          item.bboxHelper.visible = item.x > -1.35 && item.x < 3.4;
        }

        particles.rotation.y += delta * 0.03;
      }

      controls.update();
      renderer.render(scene, camera);

      // Throttle projected DOM labels to ~15fps to avoid excessive React re-renders
      frameCounter++;
      if (frameCounter % 4 === 0) {
        const pins: FloatingPin[] = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.x < -1.1 || it.x > 3.6) continue;
          projVec.set(it.x, 1.12, it.z).project(camera);
          if (projVec.z > 1 || projVec.z < -1) continue;
          const leftPct = (projVec.x * 0.5 + 0.5) * 100;
          const topPct = (-projVec.y * 0.5 + 0.5) * 100;
          if (leftPct < 6 || leftPct > 94 || topPct < 8 || topPct > 86) continue;
          pins.push({
            id: `${it.code}_${i}`,
            label: it.label,
            confidence: it.confidence,
            chute: it.chute,
            leftPct,
            topPct,
            active: Math.abs(it.x + 0.6) < 0.75,
          });
        }
        onPinsRef.current(pins);
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      disposeObject3D(scene);
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (resetNonce === 0) return;
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(7.4, 5.2, 8.6);
      controlsRef.current.target.set(0.2, 0.85, 0);
      controlsRef.current.update();
    }
  }, [resetNonce]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

export const FacilityHero3D: React.FC<FacilityHero3DProps> = ({ heightClass = 'h-[430px] sm:h-[490px]' }) => {
  const [paused, setPaused] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [pins, setPins] = useState<FloatingPin[]>([]);

  return (
    <div className="relative rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
      <div className={`relative w-full ${heightClass}`}>
        <WebGLFallbackBoundary
          heightClass={heightClass}
          title="3D Optical Sorting Line"
          subtitle="Interactive NIR Gantry, Conveyor & Robotic Delta Picker Visualization"
        >
          <HeroSceneCanvas paused={paused} resetNonce={resetNonce} onPinsUpdate={setPins} />
        </WebGLFallbackBoundary>

        {/* Projected 3D->2D Optical Readout Pins (solid dark cards, no backdrop-blur) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {pins.map((pin) => (
            <div
              key={pin.id}
              style={{ left: `${pin.leftPct}%`, top: `${pin.topPct}%` }}
              className={`absolute -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-md border text-[11px] leading-tight shadow-lg transition-transform ${
                pin.active
                  ? 'bg-emerald-950/95 border-emerald-400 text-emerald-100 scale-105'
                  : 'bg-slate-950/90 border-slate-700 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{pin.label}</span>
                <span className="font-mono text-emerald-300 tabular-nums">{pin.confidence}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">{pin.chute}</div>
            </div>
          ))}
        </div>

        {/* Top-left facility status tag */}
        <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-xs text-slate-200">
          <ScanLine className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-medium">Optical MRF Line 01</span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-emerald-400 tabular-nums">1.85 m/s</span>
        </div>

        {/* Bottom-right camera controls */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            {paused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => setResetNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset View
          </button>
        </div>
      </div>
    </div>
  );
};
