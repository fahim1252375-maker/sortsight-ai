import React from 'react';
import { Box, Layers } from 'lucide-react';

interface BoundaryProps {
  title?: string;
  subtitle?: string;
  heightClass?: string;
  children: React.ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

export class WebGLFallbackBoundary extends React.Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError || !isWebGLAvailable()) {
      return (
        <div
          className={`flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200 p-6 text-center ${
            this.props.heightClass || 'h-[360px]'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-3">
            <Layers className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-white">
            {this.props.title || '3D Industrial Schematic View'}
          </p>
          <p className="text-xs text-slate-400 max-w-md mt-1">
            {this.props.subtitle ||
              'Interactive 2D schematic fallback active because hardware WebGL context is unavailable in this environment.'}
          </p>
          <div className="mt-4 flex items-center gap-3 text-[11px] font-mono text-emerald-400">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
              <Box className="w-3.5 h-3.5" /> NIR Optical Line · 8 Chutes
            </span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
