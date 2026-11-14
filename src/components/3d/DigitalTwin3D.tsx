import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ArrowUpRight, ChevronDown, ChevronUp, Cpu, RotateCcw } from 'lucide-react';
import { disposeObject3D, isSoftwareWebGL } from './industrialProcedural';
import { WebGLFallbackBoundary } from './WebGLFallbackBoundary';

export interface DigitalTwinStageNode {
  id: string;
  name: string;
  capacityTph: number;
  currentLoadTph: number;
  contaminationRisk: number;
  recoveryEff: number;
}

interface DigitalTwin3DProps {
  stages: DigitalTwinStageNode[];
  selectedStageId?: string | null;
  onSelectStage?: (stageId: string) => void;
  onOpenStageDetail?: (stageId: string) => void;
  heightClass?: string;
}

const DEFAULT_STAGES: DigitalTwinStageNode[] = [
  { id: 'stg_infeed', name: 'Infeed & Metering', capacityTph: 18, currentLoadTph: 13.5, contaminationRisk: 0.14, recoveryEff: 0.98 },
  { id: 'stg_presort', name: 'Pre-Sort Hazard Pull', capacityTph: 16, currentLoadTph: 13.2, contaminationRisk: 0.22, recoveryEff: 0.93 },
  { id: 'stg_screen', name: 'Ballistic Disc Screen', capacityTph: 15, currentLoadTph: 12.6, contaminationRisk: 0.12, recoveryEff: 0.95 },
  { id: 'stg_nir1', name: 'NIR Polymer Sorter 1', capacityTph: 12, currentLoadTph: 11.4, contaminationRisk: 0.09, recoveryEff: 0.94 },
  { id: 'stg_eddy', name: 'Eddy Current & Magnet', capacityTph: 10, currentLoadTph: 4.8, contaminationRisk: 0.04, recoveryEff: 0.97 },
  { id: 'stg_qc', name: 'Robotic QC Final', capacityTph: 11, currentLoadTph: 8.6, contaminationRisk: 0.06, recoveryEff: 0.96 },
  { id: 'stg_baler', name: 'Automated Dual Baler', capacityTph: 14, currentLoadTph: 10.9, contaminationRisk: 0.03, recoveryEff: 0.99 },
];

type CameraPreset = 'iso' | 'top' | 'optical';

function getStageStatusColor(stage: DigitalTwinStageNode): number {
  const util = stage.capacityTph > 0 ? stage.currentLoadTph / stage.capacityTph : 0;
  if (util >= 0.92) return 0xef4444; // Bottleneck
  if (stage.contaminationRisk >= 0.18 || util >= 0.82) return 0xf59e0b; // Contamination / caution hotspot
  return 0x10b981; // Nominal
}

function DigitalTwinCanvas({
  stages,
  selectedStageId,
  preset,
  onHoverStage,
  onSelectStage,
}: {
  stages: DigitalTwinStageNode[];
  selectedStageId: string | null;
  preset: CameraPreset;
  onHoverStage: (id: string | null) => void;
  onSelectStage: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedStageId);
  selectedRef.current = selectedStageId;
  const onHoverRef = useRef(onHoverStage);
  onHoverRef.current = onHoverStage;
  const onSelectRef = useRef(onSelectStage);
  onSelectRef.current = onSelectStage;

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const ringMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const width = el.clientWidth || 720;
    const height = el.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const soft = isSoftwareWebGL(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, soft ? 1 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !soft;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b14);
    scene.fog = new THREE.FogExp2(0x060b14, 0.022);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 7.8, 12.2);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.4, 0);
    controls.minDistance = 5.5;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.47;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x090d16, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(9, 13, 8);
    key.castShadow = !soft;
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(56, 36),
      new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.85, metalness: 0.15 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(36, 36, 0x1e293b, 0x111a2b);
    scene.add(grid);

    const clickableMeshes: THREE.Object3D[] = [];
    ringMeshesRef.current.clear();

    const spacing = 2.9;
    const startX = -((stages.length - 1) * spacing) / 2;

    const stageGroups: THREE.Group[] = [];
    stages.forEach((stage, idx) => {
      const x = startX + idx * spacing;
      const z = idx % 2 === 0 ? 0 : (idx === 3 ? -0.4 : 0.35);
      const statusHex = getStageStatusColor(stage);
      const util = Math.min(1.15, stage.capacityTph > 0 ? stage.currentLoadTph / stage.capacityTph : 0.6);

      const stGroup = new THREE.Group();
      stGroup.position.set(x, 0, z);
      stGroup.userData.stageId = stage.id;

      // Industrial station plinth
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.28, 1.9),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.75 })
      );
      plinth.position.y = 0.14;
      plinth.receiveShadow = true;
      plinth.userData.stageId = stage.id;
      stGroup.add(plinth);

      // Machine body height scales slightly with stage type / utilization
      const bodyHeight = 0.95 + util * 0.65;
      const machine = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, bodyHeight, 1.35),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.36, metalness: 0.78 })
      );
      machine.position.y = 0.28 + bodyHeight / 2;
      machine.castShadow = true;
      machine.userData.stageId = stage.id;
      stGroup.add(machine);

      // Status optical beacon hood
      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.18, 1.4),
        new THREE.MeshStandardMaterial({
          color: statusHex,
          emissive: statusHex,
          emissiveIntensity: 0.7,
          roughness: 0.25,
        })
      );
      beacon.position.y = 0.28 + bodyHeight + 0.09;
      beacon.userData.stageId = stage.id;
      stGroup.add(beacon);

      // Selection ring on floor
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.28, 36),
        new THREE.MeshBasicMaterial({ color: statusHex, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      stGroup.add(ring);
      ringMeshesRef.current.set(stage.id, ring);

      scene.add(stGroup);
      stageGroups.push(stGroup);
      clickableMeshes.push(plinth, machine, beacon);

      // Connecting conveyor bridge to next stage
      if (idx < stages.length - 1) {
        const nextX = startX + (idx + 1) * spacing;
        const nextZ = (idx + 1) % 2 === 0 ? 0 : (idx + 1 === 3 ? -0.4 : 0.35);
        const midX = (x + nextX) / 2;
        const midZ = (z + nextZ) / 2;
        const dx = nextX - x;
        const dz = nextZ - z;
        const dist = Math.hypot(dx, dz);

        const bridge = new THREE.Mesh(
          new THREE.BoxGeometry(dist - 1.1, 0.14, 0.62),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.4 })
        );
        bridge.position.set(midX, 0.62, midZ);
        bridge.rotation.y = -Math.atan2(dz, dx);
        scene.add(bridge);
      }
    });

    // Animated material flow particles moving from stage 0 -> stage N-1
    const particleCount = 24;
    const flowNodes: Array<{ mesh: THREE.Mesh; t: number; speed: number }> = [];
    const flowGeo = new THREE.SphereGeometry(0.11, 12, 12);
    for (let i = 0; i < particleCount; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 5 === 0 ? 0xf59e0b : 0x34d399 });
      const orb = new THREE.Mesh(flowGeo, mat);
      scene.add(orb);
      flowNodes.push({ mesh: orb, t: i / particleCount, speed: 0.085 });
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (ev: PointerEvent) => {
      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      const stageId = hits.length > 0 ? String(hits[0].object.userData.stageId || '') : null;
      renderer.domElement.style.cursor = stageId ? 'pointer' : 'grab';
      onHoverRef.current(stageId || null);
    };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };

    const onPointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (moved > 6) return; // drag, not click
      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0 && hits[0].object.userData.stageId) {
        onSelectRef.current(String(hits[0].object.userData.stageId));
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

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

    let rafId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Animate flow orbs along spline through stages
      const lastIdx = Math.max(1, stageGroups.length - 1);
      for (const node of flowNodes) {
        node.t = (node.t + delta * node.speed) % 1;
        const f = node.t * lastIdx;
        const idxA = Math.floor(f);
        const idxB = Math.min(lastIdx, idxA + 1);
        const frac = f - idxA;
        const posA = stageGroups[idxA].position;
        const posB = stageGroups[idxB].position;
        node.mesh.position.set(
          THREE.MathUtils.lerp(posA.x, posB.x, frac),
          0.8 + Math.sin(frac * Math.PI) * 0.18,
          THREE.MathUtils.lerp(posA.z, posB.z, frac)
        );
      }

      // Highlight selected ring
      for (const [id, ring] of ringMeshesRef.current.entries()) {
        const isSel = id === selectedRef.current;
        (ring.material as THREE.MeshBasicMaterial).opacity = isSel ? 0.95 : 0.35;
        ring.scale.setScalar(isSel ? 1.15 : 1.0);
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      flowGeo.dispose();
      disposeObject3D(scene);
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
    };
  }, [stages]);

  useEffect(() => {
    const cam = cameraRef.current;
    const ctl = controlsRef.current;
    if (!cam || !ctl) return;
    if (preset === 'iso') {
      cam.position.set(0, 7.8, 12.2);
      ctl.target.set(0, 0.4, 0);
    } else if (preset === 'top') {
      cam.position.set(0, 14.5, 2.2);
      ctl.target.set(0, 0, 0);
    } else if (preset === 'optical') {
      cam.position.set(1.2, 3.8, 6.2);
      ctl.target.set(0.2, 0.7, 0);
    }
    ctl.update();
  }, [preset]);

  return <div ref={elRef} className="w-full h-full" />;
}

export const DigitalTwin3D: React.FC<DigitalTwin3DProps> = ({
  stages,
  selectedStageId,
  onSelectStage,
  onOpenStageDetail,
  heightClass = 'h-[400px]',
}) => {
  const activeStages = stages.length > 0 ? stages : DEFAULT_STAGES;
  const [internalSelected, setInternalSelected] = useState<string>(selectedStageId || activeStages[0].id);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('iso');
  const [dockExpanded, setDockExpanded] = useState(true);

  const effectiveId = selectedStageId || internalSelected;
  const activeStage = activeStages.find((s) => s.id === (hoveredId || effectiveId)) || activeStages[0];
  const utilPct = Math.round((activeStage.currentLoadTph / Math.max(0.1, activeStage.capacityTph)) * 100);
  const isBottleneck = utilPct >= 92;
  const isHotspot = !isBottleneck && (activeStage.contaminationRisk >= 0.18 || utilPct >= 82);

  const handleSelect = (id: string) => {
    setInternalSelected(id);
    onSelectStage?.(id);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/90">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-100 truncate">
            3D Interactive MRF Digital Twin Topology ({activeStages.length} Stages)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {(['iso', 'top', 'optical'] as CameraPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border whitespace-nowrap capitalize ${
                preset === p
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {p === 'iso' ? 'Isometric' : p === 'top' ? 'Top Plan' : 'Optical Focus'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreset('iso')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="Reset camera"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className={`relative w-full ${heightClass}`}>
        <WebGLFallbackBoundary
          heightClass={heightClass}
          title="3D Digital Twin Flow Topology"
          subtitle="Click any processing stage to inspect bottleneck utilization and contamination hotspots"
        >
          <DigitalTwinCanvas
            stages={activeStages}
            selectedStageId={effectiveId}
            preset={preset}
            onHoverStage={setHoveredId}
            onSelectStage={handleSelect}
          />
        </WebGLFallbackBoundary>

        {/* Legend top-left */}
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Nominal
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Contamination Hotspot
          </span>
          <span className="inline-flex items-center gap-1.5 text-red-300">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Bottleneck (&ge;92%)
          </span>
        </div>

        {/* Collapsible bottom stage inspector dock */}
        <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-slate-950/95 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isBottleneck ? 'bg-red-500' : isHotspot ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <span className="text-xs font-semibold text-white truncate">{activeStage.name}</span>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {utilPct}% load ({activeStage.currentLoadTph.toFixed(1)}/{activeStage.capacityTph} TPH)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onOpenStageDetail && (
                <button
                  type="button"
                  onClick={() => onOpenStageDetail(activeStage.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium whitespace-nowrap"
                >
                  Inspect Stage
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setDockExpanded((v) => !v)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400"
                aria-label="Toggle stage inspector"
              >
                {dockExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {dockExpanded && (
            <div className="px-3.5 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-[11px] text-slate-400">Throughput Load</div>
                <div className="font-mono font-semibold text-white tabular-nums">
                  {activeStage.currentLoadTph.toFixed(1)} / {activeStage.capacityTph} TPH
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Recovery Efficiency</div>
                <div className="font-mono font-semibold text-emerald-400 tabular-nums">
                  {(activeStage.recoveryEff * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Contamination Risk</div>
                <div
                  className={`font-mono font-semibold tabular-nums ${
                    activeStage.contaminationRisk >= 0.18 ? 'text-amber-400' : 'text-slate-200'
                  }`}
                >
                  {(activeStage.contaminationRisk * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Stage Health</div>
                <div
                  className={`font-semibold ${
                    isBottleneck ? 'text-red-400' : isHotspot ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {isBottleneck ? 'Bottleneck Alert' : isHotspot ? 'Elevated Risk' : 'Nominal Flow'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
