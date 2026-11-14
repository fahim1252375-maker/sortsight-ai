import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Box,
  Building2,
  CheckCircle2,
  Cpu,
  Globe,
  Leaf,
  Lock,
  Moon,
  Network,
  Play,
  Scan,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../lib/api.ts';
import { Facility, FeatureDefinition } from '../types/sortsight.ts';
import {
  LazyConveyorLive3D,
  LazyDigitalTwin3D,
  LazyFacilityHero3D,
  LazyMaterialExplorer3D,
  Scene3DSuspense,
} from './3d/Lazy3DScenes.tsx';
import { DigitalTwinStageNode } from './3d/DigitalTwin3D.tsx';

interface LandingPageProps {
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onEnterDemoWorkspace: (targetPath?: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  initialSection?: 'overview' | 'directory';
  isAuthenticated?: boolean;
}

const PREVIEW_TREND_DATA = [
  { day: 'Mon', recovery: 81.4, contamination: 8.2 },
  { day: 'Tue', recovery: 83.1, contamination: 7.4 },
  { day: 'Wed', recovery: 84.8, contamination: 6.9 },
  { day: 'Thu', recovery: 86.2, contamination: 6.1 },
  { day: 'Fri', recovery: 87.9, contamination: 5.5 },
  { day: 'Sat', recovery: 88.6, contamination: 5.2 },
  { day: 'Sun', recovery: 89.4, contamination: 4.8 },
];

const PREVIEW_TWIN_STAGES: DigitalTwinStageNode[] = [
  { id: 'stg_infeed', name: 'Infeed & Metering', capacityTph: 18, currentLoadTph: 14.2, contaminationRisk: 0.14, recoveryEff: 0.98 },
  { id: 'stg_presort', name: 'Pre-Sort Hazard Pull', capacityTph: 16, currentLoadTph: 13.8, contaminationRisk: 0.22, recoveryEff: 0.93 },
  { id: 'stg_screen', name: 'Ballistic Disc Screen', capacityTph: 15, currentLoadTph: 12.9, contaminationRisk: 0.12, recoveryEff: 0.95 },
  { id: 'stg_nir1', name: 'NIR Polymer Sorter 1', capacityTph: 12, currentLoadTph: 11.4, contaminationRisk: 0.08, recoveryEff: 0.95 },
  { id: 'stg_eddy', name: 'Eddy Current & Magnet', capacityTph: 10, currentLoadTph: 5.2, contaminationRisk: 0.04, recoveryEff: 0.97 },
  { id: 'stg_qc', name: 'Robotic QC Final', capacityTph: 11, currentLoadTph: 8.4, contaminationRisk: 0.05, recoveryEff: 0.96 },
  { id: 'stg_baler', name: 'Automated Dual Baler', capacityTph: 14, currentLoadTph: 11.1, contaminationRisk: 0.03, recoveryEff: 0.99 },
];

const CHUTE_MATRIX = [
  { chute: 'Chute 01', stream: 'Clear PET #1', actuator: 'Air-Jet Manifold A', threshold: '>= 0.80 conf' },
  { chute: 'Chute 02', stream: 'HDPE #2 Rigid', actuator: 'Air-Jet Manifold B', threshold: '>= 0.78 conf' },
  { chute: 'Chute 03', stream: 'OCC Cardboard', actuator: 'Star Screen Over-Fraction', threshold: '<= 8% moisture' },
  { chute: 'Chute 04', stream: 'Aluminum UBC', actuator: 'Eddy Current Rotor', threshold: 'Non-ferrous lock' },
  { chute: 'Chute 05', stream: 'Ferrous Tinplate', actuator: 'Overbelt Magnet', threshold: 'Magnetic pull' },
  { chute: 'Chute 06', stream: 'Glass Cullet', actuator: 'Air Classifier Drop', threshold: 'Density split' },
  { chute: 'Chute 07', stream: 'Manual QC Belt', actuator: 'Diverter Gate', threshold: '< 0.72 conf' },
  { chute: 'Chute 08', stream: 'HazMat Firebox', actuator: 'Emergency Solenoid', threshold: 'Li-Ion / Chem' },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onEnterDemoWorkspace,
  isDark,
  onToggleTheme,
  initialSection,
  isAuthenticated = false,
}) => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [featureCount, setFeatureCount] = useState<number>(154);
  const [featuresSample, setFeaturesSample] = useState<FeatureDefinition[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  // Interactive demo toggles on landing page
  const [demoBeltStatus, setDemoBeltStatus] = useState<'running' | 'paused'>('running');
  const [demoBeltSpeed, setDemoBeltSpeed] = useState<number>(1.85);
  const [tonnageInput, setTonnageInput] = useState<number>(120);

  // Request Demo Modal
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoForm, setDemoForm] = useState({ name: '', email: '', company: '', tonnage: '50-200 TPD' });
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  useEffect(() => {
    apiRequest<{ facilities: Facility[] }>('/facilities/directory')
      .then((res) => setFacilities(res.facilities))
      .catch(() => {});
    apiRequest<{ total: number; features: FeatureDefinition[] }>('/features')
      .then((res) => {
        setFeatureCount(res.total);
        setFeaturesSample(res.features);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialSection === 'directory') {
      document.getElementById('facilities')?.scrollIntoView({ behavior: 'smooth' });
    } else if (initialSection === 'overview') {
      document.getElementById('detection-demo')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [initialSection]);

  const filteredFacilities = useMemo(
    () =>
      facilities.filter((f) => {
        const matchesCountry = !countryFilter || f.country_code === countryFilter;
        const q = searchQuery.trim().toLowerCase();
        const matchesQuery =
          !q ||
          f.name.toLowerCase().includes(q) ||
          f.city.toLowerCase().includes(q) ||
          f.region.toLowerCase().includes(q);
        return matchesCountry && matchesQuery;
      }),
    [facilities, countryFilter, searchQuery]
  );

  // Modeled displacement factors (transparently labeled MODELED)
  const modeledCo2SavedTons = (tonnageInput * 1.62).toFixed(1);
  const modeledEnergyMwh = (tonnageInput * 3.4).toFixed(0);

  const handleSubmitDemoRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoForm.name.trim() || !demoForm.email.trim()) return;
    setDemoSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#070B14] dark:text-slate-100">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800/90 bg-white/95 dark:bg-[#070B14]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3.5">
          <a href="#top" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-display font-bold text-sm">
              S
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                SortSight AI
              </div>
              <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 leading-none">
                See Waste Differently
              </div>
            </div>
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-300">
            <a href="#detection-demo" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap">
              AI Detection
            </a>
            <a href="#material-showcase" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap">
              3D Materials
            </a>
            <a href="#smart-sorting" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap">
              Sorting Automation
            </a>
            <a href="#digital-twin" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap">
              Digital Twin
            </a>
            <a href="#architecture" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap">
              Architecture
            </a>
            <a href="#facilities" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap">
              Facilities
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle color theme"
              className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="hidden sm:inline-flex px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Request a Demo
            </button>
            <button
              type="button"
              onClick={() => (isAuthenticated ? onEnterDemoWorkspace('/dashboard') : onOpenAuth('login'))}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {isAuthenticated ? 'Return to Workspace' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      {/* SECTION 1: HERO + INTERACTIVE 3D INDUSTRIAL FACILITY */}
      <section id="top" className="relative border-b border-slate-200 dark:border-slate-800/80 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="lg:col-span-5"
            >
              <div className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-3">
                Industrial Material Recovery OS · {featureCount} Capabilities
              </div>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight leading-[1.08] text-slate-900 dark:text-white">
                Built for Industrial Recycling Complexity, Not Toy Classification.
              </h1>
              <p className="mt-5 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Transform waste streams into measurable recovery intelligence with computer vision, intelligent sorting, industrial simulation, and real-time operational analytics.
              </p>

              {/* 4 Required Primary Action Buttons */}
              <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => document.getElementById('detection-demo')?.scrollIntoView({ behavior: 'smooth' })}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  Explore Platform
                </button>
                <button
                  type="button"
                  onClick={() => onEnterDemoWorkspace('/scanner')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Scan className="h-4 w-4 text-emerald-400 shrink-0" />
                  Launch AI Scanner
                </button>
                <button
                  type="button"
                  onClick={() => onEnterDemoWorkspace('/digital-twin')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Network className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Experience Digital Twin
                </button>
                <button
                  type="button"
                  onClick={() => setDemoModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Request a Demo
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              </div>

              <div className="mt-7 pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="font-mono font-bold text-lg text-slate-900 dark:text-white tabular-nums">19 Classes</div>
                  <div className="text-slate-500 dark:text-slate-400">ISO / EU LoW Spec</div>
                </div>
                <div>
                  <div className="font-mono font-bold text-lg text-slate-900 dark:text-white tabular-nums">8 Chutes</div>
                  <div className="text-slate-500 dark:text-slate-400">Optical & Eddy Rules</div>
                </div>
                <div>
                  <div className="font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400 tabular-nums">HITL Gate</div>
                  <div className="text-slate-500 dark:text-slate-400">Calibrated QA Safety</div>
                </div>
              </div>
            </motion.div>

            {/* Right: Live Interactive 3D Recycling Facility */}
            <div className="lg:col-span-7">
              <Scene3DSuspense heightClass="h-[430px] sm:h-[490px]" label="Loading 3D Industrial Facility...">
                <LazyFacilityHero3D heightClass="h-[430px] sm:h-[490px]" />
              </Scene3DSuspense>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: AI WASTE DETECTION DEMONSTRATION */}
      <section id="detection-demo" className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-8">
          <div className="max-w-2xl">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              02 · AI Waste Detection Demonstration
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Real-Time Optical Scanning, Bounding Boxes & Chute Diversion
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Inspect multi-object classification, calibrated confidence locks, and pneumatic chute sorting directly on a simulated high-speed belt.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDemoBeltStatus((s) => (s === 'running' ? 'paused' : 'running'))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:border-emerald-500 whitespace-nowrap cursor-pointer"
            >
              {demoBeltStatus === 'running' ? 'Pause Conveyor' : 'Start Conveyor'}
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">
              <span className="text-slate-500">Speed</span>
              <input
                type="range"
                min={0.8}
                max={3.0}
                step={0.15}
                value={demoBeltSpeed}
                onChange={(e) => setDemoBeltSpeed(Number(e.target.value))}
                aria-label="Conveyor speed"
                className="w-20 accent-emerald-600"
              />
              <span className="font-mono tabular-nums">{demoBeltSpeed.toFixed(2)} m/s</span>
            </div>
            <button
              type="button"
              onClick={() => onEnterDemoWorkspace('/scanner')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              Upload Your Image <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <Scene3DSuspense heightClass="h-[360px]" label="Loading 3D Optical Belt Stream...">
          <LazyConveyorLive3D beltStatus={demoBeltStatus} beltSpeedMps={demoBeltSpeed} heightClass="h-[360px]" />
        </Scene3DSuspense>
      </section>

      {/* SECTION 3: MATERIAL INTELLIGENCE SHOWCASE (3D EXPLORER) */}
      <section id="material-showcase" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1220] py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div className="max-w-2xl">
              <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                03 · 3D Material Intelligence Showcase
              </div>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Inspect Polymer, Metal, Fiber, Glass & WEEE Fractions in 3D
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Rotate, zoom, and toggle wireframe inspection across 7 composite recyclable geometries paired with NIR wavelengths and EU LoW taxonomy rules.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEnterDemoWorkspace('/materials')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <Box className="w-3.5 h-3.5 text-emerald-600" />
              Open Full Taxonomy
            </button>
          </div>

          <Scene3DSuspense heightClass="h-[380px]" label="Loading 3D Specimen Turntable...">
            <LazyMaterialExplorer3D heightClass="h-[380px]" />
          </Scene3DSuspense>
        </div>
      </section>

      {/* SECTION 4: SMART SORTING AUTOMATION */}
      <section id="smart-sorting" className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              04 · Smart Sorting Automation
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              8-Chute Deterministic Policy Routing & Hazard Interlocks
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every visual detection evaluates calibrated confidence, surface contamination limits, and regional facility rules before dispatching simulated Modbus/OPC-UA chute commands or halting the belt on lithium-battery hazards.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onEnterDemoWorkspace('/sorting')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                Configure Sorting Rules
              </button>
              <button
                type="button"
                onClick={() => onEnterDemoWorkspace('/conveyor')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-emerald-500 cursor-pointer"
              >
                Open PLC Simulator
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHUTE_MATRIX.map((c) => (
              <div
                key={c.chute}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{c.chute}</span>
                  <span className="font-mono text-[11px] text-slate-500">{c.threshold}</span>
                </div>
                <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">{c.stream}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.actuator}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5: INDUSTRIAL DIGITAL TWIN */}
      <section id="digital-twin" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1220] py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div className="max-w-2xl">
              <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                05 · Industrial Digital Twin
              </div>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Click Any MRF Stage to Diagnose Bottlenecks & Hotspots
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Simulate throughput shifts, belt speeds, and incoming contamination surges across all 7 plant stages before adjusting physical equipment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEnterDemoWorkspace('/digital-twin')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              Launch Full Digital Twin
            </button>
          </div>

          <Scene3DSuspense heightClass="h-[400px]" label="Loading 3D MRF Digital Twin...">
            <LazyDigitalTwin3D
              stages={PREVIEW_TWIN_STAGES}
              onOpenStageDetail={() => onEnterDemoWorkspace('/digital-twin')}
              heightClass="h-[400px]"
            />
          </Scene3DSuspense>
        </div>
      </section>

      {/* SECTION 6 & 7: ADVANCED ANALYTICS PREVIEW + ENVIRONMENTAL IMPACT */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Section 6: Analytics Preview */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  06 · Advanced Analytics Preview
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                  Recovery Yield vs Contamination Trend
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onEnterDemoWorkspace('/analytics')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Open Analytics <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={PREVIEW_TREND_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="recovery" name="Recovery %" stroke="#10b981" fill="#10b981" fillOpacity={0.18} strokeWidth={2.5} />
                  <Area type="monotone" dataKey="contamination" name="Contamination %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.14} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Section 7: Environmental Impact Calculator */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 flex flex-col justify-between">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                07 · Environmental Impact (Modeled)
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                Virgin Material & CO₂e Displacement Estimator
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Uses documented EPA WARM & EU circularity displacement factors (explicitly marked MODELED, not third-party verified offsets).
              </p>

              <div className="mt-5">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Weekly Recovered Tonnage</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">{tonnageInput} t / wk</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={500}
                  step={10}
                  value={tonnageInput}
                  onChange={(e) => setTonnageInput(Number(e.target.value))}
                  aria-label="Weekly recovered tonnage"
                  className="w-full accent-emerald-600"
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300">Modeled CO₂e Avoided</div>
                  <div className="font-mono text-xl font-bold text-emerald-800 dark:text-emerald-200 tabular-nums mt-0.5">
                    {modeledCo2SavedTons} t
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">Modeled Energy Saved</div>
                  <div className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {modeledEnergyMwh} MWh
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onEnterDemoWorkspace('/environment')}
              className="mt-6 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-xs font-semibold cursor-pointer"
            >
              <Leaf className="w-3.5 h-3.5 text-emerald-600" />
              Open Sustainability Calculator
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 8: ENTERPRISE SECURITY */}
      <section className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1220] py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl mb-8">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              08 · Enterprise Security & Multi-Tenant Governance
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Tenant-Isolated by Design. Auditable at Every Decision.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F172A]">
              <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-3" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Strict Multi-Tenant RBAC</h3>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                JWT & scoped API-key middleware enforce organization boundaries across every detection, policy, review, and batch record.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F172A]">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-3" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">AES-256-GCM & Audit Trail</h3>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Webhook secrets encrypted at rest with AES-256-GCM, SHA-256 hashed API keys, and immutable operator action logging.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F172A]">
              <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-3" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Honest AI & Safety Disclaimers</h3>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Visual detection is never presented as chemical verification. Offline heuristic fallback triggers cleanly when Gemini is offline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 9: PLATFORM ARCHITECTURE + FACILITY DIRECTORY */}
      <section id="architecture" className="mx-auto max-w-7xl px-6 py-16 space-y-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              09 · Platform Architecture
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              {featureCount} Tracked Production Capabilities
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Full-stack React 19, TypeScript, Express REST API, SQLite relational schema, and Three.js visualization pipeline with transparent simulator boundaries.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onEnterDemoWorkspace('/developers')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-emerald-500 cursor-pointer"
              >
                Inspect OpenAPI & Registry
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-100">Feature Registry Sample (/api/v1/features)</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">{featureCount} Total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">ID</th>
                    <th className="py-2.5 px-4">Capability</th>
                    <th className="py-2.5 px-4">Endpoint</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {featuresSample.slice(0, 7).map((feat) => (
                    <tr key={feat.id}>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">{feat.id}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{feat.name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">{feat.apiEndpoint}</td>
                      <td className="py-2.5 px-4 font-mono text-emerald-600 dark:text-emerald-400">{feat.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Public Global Directory */}
        <div id="facilities" className="pt-8 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Global Recycling Facility Directory
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Click any facility to view regional throughput specs and telemetry.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search city or facility..."
                  className="pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                aria-label="Filter by country"
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">All Countries</option>
                <option value="SE">Sweden (SE)</option>
                <option value="NL">Netherlands (NL)</option>
                <option value="US">United States (US)</option>
                <option value="JP">Japan (JP)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Facility</th>
                  <th className="py-3 px-4 font-medium">Organization</th>
                  <th className="py-3 px-4 font-medium">Location</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium text-right">Capacity (t/day)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredFacilities.map((fac) => (
                  <tr key={fac.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="py-3 px-4 font-medium">
                      <Link
                        to={`/facilities/${fac.id}`}
                        className="text-emerald-700 dark:text-emerald-400 hover:underline font-semibold inline-flex items-center gap-1.5"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        {fac.name}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-slate-500">{fac.facility_code}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{fac.organization_name}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {fac.city}, {fac.region} ({fac.country_code})
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{fac.facility_type}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {fac.capacity_tons_per_day}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 10: CALL TO ACTION */}
      <section className="border-t border-slate-200 dark:border-slate-800 bg-slate-900 text-white py-16">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-400">
            10 · Ready for Plant Deployment
          </div>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-white">
            See Waste Differently. Recover More. Waste Less.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            Evaluate SortSight AI immediately in our live seeded MRF sandbox, provision your own isolated tenant, or schedule an engineering walkthrough.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onEnterDemoWorkspace('/scanner')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4" />
              Launch AI Scanner
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              Create Organization
            </button>
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/10 text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              Request a Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B14] py-8 px-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <span className="font-semibold text-slate-900 dark:text-white">SortSight AI</span> · Global Recycling Intelligence Platform
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>Visual AI is not chemical verification</span>
            <span>·</span>
            <span>Seeded entries labeled DEMO DATA</span>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              Workspace Sign In
            </button>
          </div>
        </div>
      </footer>

      {/* Enterprise Demo Request Modal */}
      {demoModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-label="Request Enterprise Demo"
          onClick={() => setDemoModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">Request Engineering Demo</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Schedule a plant walkthrough or launch our live sandbox immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDemoModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {demoSubmitted ? (
              <div className="py-6 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <div className="font-semibold text-slate-900 dark:text-white">Demo Request Recorded</div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Thank you, {demoForm.name}. While our automation specialists prepare your facility briefing, you can explore the full live sandbox right now.
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDemoModalOpen(false);
                      onEnterDemoWorkspace('/dashboard');
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Enter Live Sandbox Now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDemoSubmitted(false);
                      setDemoModalOpen(false);
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitDemoRequest} className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium mb-1">Full Name</label>
                  <input
                    required
                    type="text"
                    value={demoForm.name}
                    onChange={(e) => setDemoForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Astrid Lindqvist"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Work Email</label>
                  <input
                    required
                    type="email"
                    value={demoForm.email}
                    onChange={(e) => setDemoForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="astrid@nordicmrf.se"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Facility / Org</label>
                    <input
                      type="text"
                      value={demoForm.company}
                      onChange={(e) => setDemoForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder="Nordic MRF AB"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Daily Throughput</label>
                    <select
                      value={demoForm.tonnage}
                      onChange={(e) => setDemoForm((f) => ({ ...f, tonnage: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    >
                      <option>&lt; 50 TPD</option>
                      <option>50-200 TPD</option>
                      <option>200-600 TPD</option>
                      <option>600+ TPD Network</option>
                    </select>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDemoModalOpen(false);
                      onEnterDemoWorkspace('/dashboard');
                    }}
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                  >
                    Skip & Launch Sandbox
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
