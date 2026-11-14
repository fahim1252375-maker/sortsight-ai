import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Eye, Grid3X3, Pause, Play, RotateCcw } from 'lucide-react';
import {
  buildMaterialModel,
  disposeObject3D,
  isSoftwareWebGL,
  MATERIAL_3D_SPECS,
  Material3DCode,
} from './industrialProcedural';
import { WebGLFallbackBoundary } from './WebGLFallbackBoundary';

interface MaterialExplorer3DProps {
  selectedCode?: Material3DCode;
  onSelectMaterial?: (code: Material3DCode) => void;
  heightClass?: string;
  compact?: boolean;
}

const MATERIAL_ORDER: Material3DCode[] = [
  'PET_01',
  'HDPE_02',
  'ALUM_CAN',
  'STEEL_FE',
  'GLASS_CLR',
  'OCC_CARD',
  'EWASTE_PCB',
];

function MaterialCanvas({
  activeCode,
  wireframe,
  autoRotate,
  resetNonce,
}: {
  activeCode: Material3DCode;
  wireframe: boolean;
  autoRotate: boolean;
  resetNonce: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const wireframeRef = useRef(wireframe);
  wireframeRef.current = wireframe;

  const modelRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth || 560;
    const height = el.clientHeight || 360;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const soft = isSoftwareWebGL(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, soft ? 1 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !soft;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 40);
    camera.position.set(1.85, 1.55, 2.3);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.62, 0);
    controls.minDistance = 1.3;
    controls.maxDistance = 4.6;
    controls.maxPolarAngle = Math.PI * 0.52;
    controlsRef.current = controls;

    // Industrial studio three-point lighting
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.7);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 5, 3);
    key.castShadow = !soft;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x10b981, 0.9);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    // Turntable calibration plinth
    const plinthGroup = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.02, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.75 })
    );
    disc.position.y = -0.05;
    disc.receiveShadow = true;
    plinthGroup.add(disc);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 0.8, 48),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.008;
    plinthGroup.add(ring);
    scene.add(plinthGroup);

    const onContextLost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(120, entry.contentRect.width);
        const h = Math.max(120, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(el);

    let rafId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (modelRef.current && autoRotateRef.current) {
        modelRef.current.rotation.y += delta * 0.55;
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

  // Swap 3D model when activeCode changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (modelRef.current) {
      scene.remove(modelRef.current);
      disposeObject3D(modelRef.current);
      modelRef.current = null;
    }
    const group = buildMaterialModel(activeCode, 1.0);
    // Center bounding box cleanly on plinth
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.position.x -= center.x;
    group.position.z -= center.z;
    group.position.y -= box.min.y;

    group.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          (mat as THREE.MeshStandardMaterial).wireframe = wireframeRef.current;
        });
      }
    });

    scene.add(group);
    modelRef.current = group;
  }, [activeCode]);

  // Toggle wireframe without rebuilding model
  useEffect(() => {
    if (!modelRef.current) return;
    modelRef.current.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
        });
      }
    });
  }, [wireframe]);

  // Camera reset
  useEffect(() => {
    if (resetNonce === 0) return;
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(1.85, 1.55, 2.3);
      controlsRef.current.target.set(0, 0.62, 0);
      controlsRef.current.update();
    }
  }, [resetNonce]);

  return <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

export const MaterialExplorer3D: React.FC<MaterialExplorer3DProps> = ({
  selectedCode,
  onSelectMaterial,
  heightClass = 'h-[360px]',
  compact = false,
}) => {
  const [internalCode, setInternalCode] = useState<Material3DCode>(selectedCode || 'PET_01');
  const activeCode = selectedCode || internalCode;

  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);

  const handleSelect = (code: Material3DCode) => {
    setInternalCode(code);
    onSelectMaterial?.(code);
  };

  const spec = MATERIAL_3D_SPECS[activeCode];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/90">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold tracking-wide text-slate-100 truncate">
            3D Optical Material Specimen Inspector
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 whitespace-nowrap"
          >
            {autoRotate ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {autoRotate ? 'Pause Spin' : 'Auto Spin'}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border whitespace-nowrap ${
              wireframe
                ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Grid3X3 className="w-3 h-3" />
            Mesh
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

      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}>
        <div className={`${compact ? '' : 'lg:col-span-8'} relative ${heightClass} bg-[radial-gradient(circle_at_50%_40%,#132a2e_0%,#060b14_78%)]`}>
          <WebGLFallbackBoundary heightClass={heightClass} title={spec.name} subtitle={spec.opticalSignature}>
            <MaterialCanvas
              activeCode={activeCode}
              wireframe={wireframe}
              autoRotate={autoRotate}
              resetNonce={resetNonce}
            />
          </WebGLFallbackBoundary>
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-slate-300">
            <span className="px-2 py-1 rounded bg-slate-900/90 border border-slate-700/80">
              Drag to orbit · Scroll to zoom
            </span>
            <span className="px-2 py-1 rounded bg-slate-900/90 border border-emerald-500/40 text-emerald-300 tabular-nums">
              {spec.code} · {spec.dimensions}
            </span>
          </div>
        </div>

        <div className={`${compact ? 'border-t' : 'lg:col-span-4 border-t lg:border-t-0 lg:border-l'} border-slate-800 p-4 flex flex-col justify-between bg-slate-900/60`}>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              Specimen Selector
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-1.5">
              {MATERIAL_ORDER.map((code) => {
                const s = MATERIAL_3D_SPECS[code];
                const active = code === activeCode;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleSelect(code)}
                    className={`px-2.5 py-1.5 rounded-lg text-left border text-xs transition whitespace-nowrap truncate ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/15 text-white font-semibold'
                        : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-mono text-[11px]">{s.code}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2.5">
              <div>
                <h4 className="text-sm font-semibold text-white">{spec.name}</h4>
                <p className="text-xs text-slate-400">{spec.resinOrCode}</p>
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Target Chute</dt>
                  <dd className="font-mono text-emerald-300">{spec.chute}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Specific Gravity</dt>
                  <dd className="font-mono text-slate-200 tabular-nums">{spec.density}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 mb-0.5">Optical Signature</dt>
                  <dd className="text-slate-200">{spec.opticalSignature}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
