import React, { Suspense } from 'react';

export const LazyFacilityHero3D = React.lazy(() =>
  import('./FacilityHero3D').then((m) => ({ default: m.FacilityHero3D }))
);

export const LazyConveyorLive3D = React.lazy(() =>
  import('./ConveyorLive3D').then((m) => ({ default: m.ConveyorLive3D }))
);

export const LazyMaterialExplorer3D = React.lazy(() =>
  import('./MaterialExplorer3D').then((m) => ({ default: m.MaterialExplorer3D }))
);

export const LazyDigitalTwin3D = React.lazy(() =>
  import('./DigitalTwin3D').then((m) => ({ default: m.DigitalTwin3D }))
);

export const Scene3DFallback: React.FC<{ heightClass?: string; label?: string }> = ({
  heightClass = 'h-[360px]',
  label = 'Initializing 3D industrial telemetry canvas...',
}) => (
  <div
    className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col items-center justify-center ${heightClass}`}
  >
    <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
    <span className="mt-3 text-xs font-mono text-slate-400">{label}</span>
  </div>
);

export const Scene3DSuspense: React.FC<{
  heightClass?: string;
  label?: string;
  children: React.ReactNode;
}> = ({ heightClass, label, children }) => (
  <Suspense fallback={<Scene3DFallback heightClass={heightClass} label={label} />}>{children}</Suspense>
);
