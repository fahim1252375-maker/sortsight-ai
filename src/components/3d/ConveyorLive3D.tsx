import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Activity, Eye, RotateCcw } from 'lucide-react';
import {
  buildConveyorAssembly,
  buildMaterialModel,
  buildOpticalGantry,
  disposeObject3D,
  isSoftwareWebGL,
  Material3DCode,
} from './industrialProcedural';
import { WebGLFallbackBoundary } from './WebGLFallbackBoundary';

interface BeltItem {
  code: Material3DCode;
  label: string;
  confidence: number;
  chuteLabel: string;
  chuteColor: number;
  targetZ: number;
  x: number;
  z: number;
  diverted: boolean;
  mesh: THREE.Group;
  bbox: THREE.LineSegments;
}

interface DetectionReadout {
  code: Material3DCode;
  label: string;
  confidence: number;
  chuteLabel: string;
}

interface ConveyorLive3DProps {
  beltStatus?: 'running' | 'paused' | 'emergency_stop';
  beltSpeedMps?: number;
  showBoundingBoxes?: boolean;
  heightClass?: string;
}

function ConveyorCanvas({
  beltStatus,
  beltSpeedMps,
  showBoundingBoxes,
  resetNonce,
  onDetect,
}: {
  beltStatus: 'running' | 'paused' | 'emergency_stop';
  beltSpeedMps: number;
  showBoundingBoxes: boolean;
  resetNonce: number;
  onDetect: (item: DetectionReadout) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(beltStatus);
  statusRef.current = beltStatus;
  const speedRef = useRef(beltSpeedMps);
  speedRef.current = beltSpeedMps;
  const bboxVisibleRef = useRef(showBoundingBoxes);
  bboxVisibleRef.current = showBoundingBoxes;
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const statusLedRef = useRef<THREE.Mesh | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const width = el.clientWidth || 640;
    const height = el.clientHeight || 340;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const soft = isSoftwareWebGL(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, soft ? 1 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !soft;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d18);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    camera.position.set(0.8, 4.1, 7.6);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0.4, 0.5, 0);
    controls.minDistance = 4;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI * 0.48;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(5, 8, 5);
    key.castShadow = !soft;
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 26),
      new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const { group: conveyorGroup, beltTexture } = buildConveyorAssembly(13.5, 2.2);
    scene.add(conveyorGroup);

    // Optical scanner gantry at x = -1.2
    const { group: gantry, scanBeam, statusLed } = buildOpticalGantry(2.5);
    gantry.position.set(-1.2, 0, 0);
    statusLedRef.current = statusLed;
    scene.add(gantry);

    // 4 Pneumatic Chutes at x = 2.0 and x = 4.2 (left/right)
    const chuteSpecs = [
      { x: 1.8, z: 1.85, color: 0x10b981 },
      { x: 1.8, z: -1.85, color: 0x38bdf8 },
      { x: 4.1, z: 1.85, color: 0xf59e0b },
      { x: 4.1, z: -1.85, color: 0xa855f7 },
    ];
    for (const c of chuteSpecs) {
      const bin = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.25, 1.15),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.7 })
      );
      bin.position.set(c.x, -0.88, c.z);
      scene.add(bin);

      const collar = new THREE.Mesh(
        new THREE.BoxGeometry(1.34, 0.12, 1.19),
        new THREE.MeshStandardMaterial({ color: c.color, emissive: c.color, emissiveIntensity: 0.4 })
      );
      collar.position.set(c.x, -0.25, c.z);
      scene.add(collar);
    }

    const catalog: Array<{ code: Material3DCode; label: string; conf: number; chute: string; color: number; targetZ: number }> = [
      { code: 'PET_01', label: 'Clear PET #1', conf: 95.2, chute: 'Air-Jet 1 (PET)', color: 0x10b981, targetZ: 1.6 },
      { code: 'ALUM_CAN', label: 'Alum UBC Can', conf: 96.8, chute: 'Eddy Current (Alum)', color: 0x38bdf8, targetZ: -1.6 },
      { code: 'OCC_CARD', label: 'Corrugated OCC', conf: 91.4, chute: 'Air-Knife (Fiber)', color: 0xf59e0b, targetZ: 1.6 },
      { code: 'EWASTE_PCB', label: 'WEEE Circuit', conf: 88.7, chute: 'Quarantine Pick', color: 0xa855f7, targetZ: -1.6 },
      { code: 'HDPE_02', label: 'HDPE #2 Jug', conf: 93.1, chute: 'Air-Jet 2 (HDPE)', color: 0x10b981, targetZ: 1.6 },
      { code: 'STEEL_FE', label: 'Ferrous Steel', conf: 94.5, chute: 'Cross-Magnet (Fe)', color: 0x38bdf8, targetZ: -1.6 },
    ];

    const beltItems: BeltItem[] = catalog.map((c, idx) => {
      const mesh = buildMaterialModel(c.code, 0.54);
      const startX = -5.8 + idx * 2.1;
      const laneZ = (idx % 2 === 0 ? -1 : 1) * 0.34;
      mesh.position.set(startX, 0.1, laneZ);
      scene.add(mesh);

      const boxGeo = new THREE.BoxGeometry(0.84, 0.88, 0.84);
      const edges = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const bbox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: c.color }));
      bbox.position.set(startX, 0.52, laneZ);
      bbox.visible = false;
      scene.add(bbox);

      return {
        code: c.code,
        label: c.label,
        confidence: c.conf,
        chuteLabel: c.chute,
        chuteColor: c.color,
        targetZ: c.targetZ,
        x: startX,
        z: laneZ,
        diverted: false,
        mesh,
        bbox,
      };
    });

    const onContextLost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(160, entry.contentRect.width);
        const h = Math.max(160, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(el);

    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let lastNotified = '';

    const tick = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const isRunning = statusRef.current === 'running';
      const isEstop = statusRef.current === 'emergency_stop';

      if (statusLedRef.current) {
        const ledMat = statusLedRef.current.material as THREE.MeshStandardMaterial;
        const ledHex = isEstop ? 0xef4444 : isRunning ? 0x10b981 : 0xf59e0b;
        ledMat.color.setHex(ledHex);
        ledMat.emissive.setHex(ledHex);
      }
      scanBeam.visible = isRunning;

      if (isRunning) {
        elapsed += delta;
        const speed = Math.max(0.5, Math.min(3.5, speedRef.current));
        beltTexture.offset.y -= delta * speed * 0.42;
        scanBeam.position.z = Math.sin(elapsed * 5) * 0.12;

        for (let i = 0; i < beltItems.length; i++) {
          const item = beltItems[i];
          item.x += delta * speed * 0.85;

          // Trigger readout when item passes NIR gantry (-1.2)
          if (Math.abs(item.x - -1.2) < 0.25 && lastNotified !== item.code) {
            lastNotified = item.code;
            onDetectRef.current({
              code: item.code,
              label: item.label,
              confidence: item.confidence,
              chuteLabel: item.chuteLabel,
            });
          }

          // Pneumatic diversion past x > 1.5
          if (item.x > 1.6) {
            item.diverted = true;
            item.z = THREE.MathUtils.lerp(item.z, item.targetZ, delta * 3.2);
          }

          if (item.x > 6.0) {
            item.x = -6.0;
            item.z = (i % 2 === 0 ? -1 : 1) * 0.34;
            item.diverted = false;
          }

          item.mesh.position.set(item.x, item.diverted && Math.abs(item.z) > 1.1 ? -0.15 : 0.1, item.z);
          item.bbox.position.set(item.x, item.mesh.position.y + 0.42, item.z);
          item.bbox.visible = bboxVisibleRef.current && item.x > -1.8 && item.x < 3.6;
        }
      }

      controls.update();
      renderer.render(scene, camera);
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
      cameraRef.current.position.set(0.8, 4.1, 7.6);
      controlsRef.current.target.set(0.4, 0.5, 0);
      controlsRef.current.update();
    }
  }, [resetNonce]);

  return <div ref={elRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

export const ConveyorLive3D: React.FC<ConveyorLive3DProps> = ({
  beltStatus = 'running',
  beltSpeedMps = 1.85,
  showBoundingBoxes = true,
  heightClass = 'h-[340px]',
}) => {
  const [bboxEnabled, setBboxEnabled] = useState(showBoundingBoxes);
  const [resetNonce, setResetNonce] = useState(0);
  const [latestDetection, setLatestDetection] = useState<DetectionReadout>({
    code: 'PET_01',
    label: 'Clear PET #1',
    confidence: 95.2,
    chuteLabel: 'Air-Jet 1 (PET)',
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/90">
        <div className="flex items-center gap-2.5 min-w-0">
          <Activity
            className={`w-4 h-4 shrink-0 ${
              beltStatus === 'emergency_stop'
                ? 'text-red-400'
                : beltStatus === 'running'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
            }`}
          />
          <span className="text-xs font-semibold text-slate-100 truncate">
            3D Optical Conveyor & Pneumatic Chute Simulation
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 tabular-nums">
            {beltSpeedMps.toFixed(2)} m/s
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setBboxEnabled((b) => !b)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border whitespace-nowrap ${
              bboxEnabled
                ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}
          >
            <Eye className="w-3 h-3" />
            AI Boxes
          </button>
          <button
            type="button"
            onClick={() => setResetNonce((n) => n + 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      <div className={`relative w-full ${heightClass}`}>
        <WebGLFallbackBoundary
          heightClass={heightClass}
          title="3D Conveyor Optical Stream"
          subtitle="Animated conveyor belt, NIR optical beam, and pneumatic chute diversion"
        >
          <ConveyorCanvas
            beltStatus={beltStatus}
            beltSpeedMps={beltSpeedMps}
            showBoundingBoxes={bboxEnabled}
            resetNonce={resetNonce}
            onDetect={setLatestDetection}
          />
        </WebGLFallbackBoundary>

        {/* Bottom HUD detection strip */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-xs flex items-center gap-3">
            <span className="text-slate-400">Latest Optical Lock:</span>
            <span className="font-semibold text-white">{latestDetection.label}</span>
            <span className="font-mono text-emerald-400 tabular-nums">{latestDetection.confidence.toFixed(1)}%</span>
            <span className="font-mono text-sky-300 text-[11px]">{latestDetection.chuteLabel}</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300">
            MODE: SIMULATOR
          </div>
        </div>
      </div>
    </div>
  );
};
