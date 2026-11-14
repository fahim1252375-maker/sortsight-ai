import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Layers,
  Pause,
  Play,
  RefreshCw,
  Scan,
  ShieldAlert,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import {
  AlertBanner,
  Button,
  EmptyState,
  Panel,
  SectionHeader,
  StatusTag,
} from '../components/ui/DesignSystem.tsx';
import { useToast } from '../components/ui/ToastProvider.tsx';
import { apiRequest } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { generateSampleInspectionImages, SampleInspectionImage } from '../lib/sampleCanvas.ts';
import { DetectedObjectItem, Facility, LanguageCode, VisionPipelineResult } from '../types/sortsight.ts';

interface ScannerSuiteViewProps {
  mode: 'scanner' | 'realtime' | 'batch';
  activeFacility?: Facility;
  language: LanguageCode;
}

export const ScannerSuiteView: React.FC<ScannerSuiteViewProps> = ({ mode, activeFacility, language }) => {
  const { pushToast } = useToast();
  const samples = useMemo<SampleInspectionImage[]>(() => generateSampleInspectionImages(), []);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(samples[0]?.dataUrl || '');
  const [selectedFileName, setSelectedFileName] = useState<string>(samples[0]?.fileName || 'sample.png');
  const [preferredMode, setPreferredMode] = useState<'cloud_gemini' | 'offline_edge'>('cloud_gemini');
  const [storeHistory, setStoreHistory] = useState<boolean>(true);
  const [showPolygons, setShowPolygons] = useState<boolean>(true);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisionPipelineResult | null>(null);
  const [selectedObj, setSelectedObj] = useState<DetectedObjectItem | null>(null);

  // Batch state
  const [batchQueue, setBatchQueue] = useState<Array<{ imageBase64DataUrl: string; imageName: string }>>([]);
  const [batchProgressPct, setBatchProgressPct] = useState<number>(0);
  const [batchResult, setBatchResult] = useState<{
    processedCount: number;
    totalObjects: number;
    avgReadinessScore: number;
    avgRecoveryScore: number;
    hazardFrames: number;
    items: VisionPipelineResult[];
  } | null>(null);

  // Realtime Webcam & Video Frame state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraStatus, setCameraStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [captureIntervalSec, setCaptureIntervalSec] = useState<number>(5);
  const [autoStreamRunning, setAutoStreamRunning] = useState<boolean>(false);
  const [streamPaused, setStreamPaused] = useState<boolean>(false);
  const [realtimeHistory, setRealtimeHistory] = useState<VisionPipelineResult[]>([]);
  const [videoFramesResult, setVideoFramesResult] = useState<Array<{ timestampSec: number } & VisionPipelineResult>>([]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, []);

  const ingestFileList = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setError(null);

    if (mode === 'batch') {
      const readers = files
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, 10)
        .map(
          (file) =>
            new Promise<{ imageBase64DataUrl: string; imageName: string }>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve({ imageBase64DataUrl: String(r.result), imageName: file.name });
              r.onerror = () => reject(new Error(`Failed to read ${file.name}`));
              r.readAsDataURL(file);
            })
        );
      Promise.all(readers)
        .then((items) => {
          setBatchQueue((prev) => [...prev, ...items].slice(0, 10));
          pushToast({ tone: 'info', title: `Added ${items.length} image(s) to batch queue` });
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'File upload error'));
      return;
    }

    const file = files[0];
    if (file.type.startsWith('video/')) {
      extractVideoFrames(file);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please provide a valid image file (PNG, JPG, WebP) or video file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageUrl(String(reader.result));
      setSelectedFileName(file.name);
      setResult(null);
      setSelectedObj(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      ingestFileList(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      ingestFileList(e.dataTransfer.files);
    }
  };

  const extractVideoFrames = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const videoUrl = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.src = videoUrl;
      vid.muted = true;
      await new Promise<void>((res, rej) => {
        vid.onloadedmetadata = () => res();
        vid.onerror = () => rej(new Error('Could not decode video file.'));
      });
      const duration = Math.max(1, vid.duration || 3);
      const times = [0.2, duration * 0.45, duration * 0.8];
      const frames: Array<{ imageBase64DataUrl: string; imageName: string; timestampSec: number }> = [];
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < times.length; i++) {
        vid.currentTime = Math.min(duration - 0.1, times[i]);
        await new Promise<void>((res) => {
          vid.onseeked = () => res();
        });
        if (ctx) {
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          frames.push({
            imageBase64DataUrl: canvas.toDataURL('image/jpeg', 0.85),
            imageName: `${file.name}_frame_${i + 1}.jpg`,
            timestampSec: Number(times[i].toFixed(1)),
          });
        }
      }
      URL.revokeObjectURL(videoUrl);

      if (!activeFacility) throw new Error('Select a facility first.');
      const res = await apiRequest<{ frames: Array<{ timestampSec: number } & VisionPipelineResult> }>(
        '/detection/video-frames',
        {
          method: 'POST',
          body: JSON.stringify({
            facilityId: activeFacility.id,
            frames,
            preferredMode,
            storeHistory,
          }),
        }
      );
      setVideoFramesResult(res.frames);
      setRealtimeHistory((prev) => [...res.frames, ...prev].slice(0, 20));
      if (res.frames[0]) {
        setSelectedImageUrl(frames[0].imageBase64DataUrl);
        setResult(res.frames[0]);
        setSelectedObj(res.frames[0].objects[0] || null);
      }
      pushToast({ tone: 'success', title: `Extracted & analyzed ${res.frames.length} video keyframes` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video processing failed.');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysisForImage = async (imageDataUrl: string, imageName: string, source: 'upload' | 'camera' | 'offline_edge') => {
    if (!activeFacility) {
      setError('No active facility selected.');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<VisionPipelineResult>('/detection/analyze', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: activeFacility.id,
          imageBase64DataUrl: imageDataUrl,
          imageName,
          sourceType: source,
          storeHistory,
          preferredMode,
        }),
      });
      setResult(res);
      setSelectedObj(res.objects[0] || null);
      if (mode === 'realtime') {
        setRealtimeHistory((prev) => [res, ...prev].slice(0, 20));
      }
      if (res.hasHazards) {
        pushToast({
          tone: 'critical',
          title: 'Hazard Detected in Frame',
          description: 'Escalated to Hazard Intelligence & Human Review Queue.',
        });
      }
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runSingleAnalysis = async () => {
    await runAnalysisForImage(
      selectedImageUrl,
      selectedFileName,
      cameraActive ? 'camera' : preferredMode === 'offline_edge' ? 'offline_edge' : 'upload'
    );
  };

  const runBatchAnalysis = async () => {
    if (!activeFacility) return;
    const queue =
      batchQueue.length > 0
        ? batchQueue
        : samples.map((s) => ({ imageBase64DataUrl: s.dataUrl, imageName: s.fileName }));
    setLoading(true);
    setError(null);
    setBatchProgressPct(25);
    const timer = setInterval(() => {
      setBatchProgressPct((p) => (p < 85 ? p + 12 : p));
    }, 350);

    try {
      const res = await apiRequest<NonNullable<typeof batchResult>>('/detection/batch', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: activeFacility.id,
          images: queue,
          preferredMode,
          storeHistory,
        }),
      });
      setBatchProgressPct(100);
      setBatchResult(res);
      pushToast({ tone: 'success', title: `Batch complete: ${res.processedCount} frames analyzed` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch analysis failed.');
      setBatchProgressPct(0);
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  const exportBatchCsv = () => {
    if (!batchResult) return;
    const headers = ['detection_id', 'image_name', 'provider', 'objects', 'readiness_score', 'recovery_score', 'has_hazards', 'needs_human_review'];
    const lines = [
      headers.join(','),
      ...batchResult.items.map((item) =>
        [
          item.detectionRecordId,
          item.imageName,
          item.inferenceProvider,
          item.objects.length,
          item.overallReadinessScore,
          item.overallRecoveryScore,
          item.hasHazards ? 'yes' : 'no',
          item.needsHumanReview ? 'yes' : 'no',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sortsight_batch_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleWebcam = async () => {
    if (cameraActive) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setCameraActive(false);
      setAutoStreamRunning(false);
      setCameraStatus('disconnected');
      return;
    }
    setCameraStatus('connecting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser mediaDevices API unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setCameraStatus('connected');
      setError(null);
      pushToast({ tone: 'success', title: 'Live camera connected' });
    } catch {
      setCameraActive(false);
      setCameraStatus('error');
      setError('Camera permission unavailable or no physical camera attached. Use sample conveyor frames or upload an image/video.');
    }
  };

  const captureWebcamFrame = (analyzeImmediately = false) => {
    if (!videoRef.current || !cameraActive) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const fname = `webcam_capture_${Date.now()}.jpg`;
      setSelectedImageUrl(dataUrl);
      setSelectedFileName(fname);
      if (analyzeImmediately) {
        runAnalysisForImage(dataUrl, fname, 'camera');
      }
    }
  };

  // Auto-capture interval loop for Real-Time Detection Studio (only when camera is truly connected)
  useEffect(() => {
    if (mode !== 'realtime' || !cameraActive || !autoStreamRunning || streamPaused) return;
    const id = setInterval(() => {
      if (!loading) {
        captureWebcamFrame(true);
      }
    }, captureIntervalSec * 1000);
    return () => clearInterval(id);
  });

  const exportScanPdf = () => {
    if (!result) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('SortSight AI — Waste Inspection Report', 14, 18);
    doc.setFontSize(10);
    doc.text(`Record ID: ${result.detectionRecordId} | Facility: ${activeFacility?.name || result.facilityId}`, 14, 26);
    doc.text(`Inference Provider: ${result.inferenceProvider} | Latency: ${result.inferenceLatencyMs} ms`, 14, 32);
    doc.text(`Overall Readiness: ${result.overallReadinessScore}/100 | Recovery Score: ${result.overallRecoveryScore}/100`, 14, 38);
    doc.text(`Disclaimer: ${result.visualInspectionDisclaimer.slice(0, 95)}`, 14, 46);

    let y = 58;
    result.objects.forEach((obj, i) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.text(`${i + 1}. ${obj.label} [${obj.materialCode}] — ${(obj.calibratedConfidence * 100).toFixed(1)}% conf`, 14, y);
      doc.setFontSize(9);
      doc.text(`Status: ${obj.recyclableStatus} | Chute: ${obj.recommendedChute} | Purity: ${obj.contamination.purityEstimatePct}%`, 18, y + 6);
      doc.text(`Advice: ${obj.separationAdvice.slice(0, 90)}`, 18, y + 12);
      y += 22;
    });

    doc.save(`sortsight_${result.detectionRecordId}.pdf`);
    pushToast({ tone: 'success', title: 'PDF inspection report exported' });
  };

  const statusColor = (status: DetectedObjectItem['recyclableStatus']) => {
    if (status === 'recyclable') return '#059669';
    if (status === 'conditional') return '#d97706';
    if (status === 'hazardous') return '#dc2626';
    return '#64748b';
  };

  // Batch Summary Material Breakdown
  const batchBreakdown = useMemo(() => {
    if (!batchResult) return [];
    const map = new Map<string, { code: string; count: number; avgConf: number; hazCount: number }>();
    for (const item of batchResult.items) {
      for (const obj of item.objects) {
        const cur = map.get(obj.materialCode) || { code: obj.materialCode, count: 0, avgConf: 0, hazCount: 0 };
        cur.avgConf = (cur.avgConf * cur.count + obj.calibratedConfidence * 100) / (cur.count + 1);
        cur.count += 1;
        if (obj.hazard.isHazardous) cur.hazCount += 1;
        map.set(obj.materialCode, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [batchResult]);

  // Realtime session aggregate stats
  const realtimeStats = useMemo(() => {
    const frames = realtimeHistory.length;
    const totalObjs = realtimeHistory.reduce((s, r) => s + r.objects.length, 0);
    const avgRec = frames ? Math.round(realtimeHistory.reduce((s, r) => s + r.overallRecoveryScore, 0) / frames) : 0;
    const hazCount = realtimeHistory.filter((r) => r.hasHazards).length;
    return { frames, totalObjs, avgRec, hazCount };
  }, [realtimeHistory]);

  return (
    <div className="space-y-5">
      {/* Header + Inference Mode Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {mode === 'batch'
                ? 'Batch Waste Image Analysis'
                : mode === 'realtime'
                  ? 'Real-Time Detection Studio'
                  : 'Smart Waste Scanner'}
            </h1>
            {mode === 'realtime' && (
              <StatusTag tone={cameraActive ? 'emerald' : cameraStatus === 'error' ? 'rose' : 'neutral'}>
                {cameraActive
                  ? streamPaused
                    ? 'CAMERA PAUSED'
                    : 'CAMERA CONNECTED (LIVE)'
                  : cameraStatus === 'error'
                    ? 'CAMERA UNAVAILABLE'
                    : 'CAMERA NOT CONNECTED'}
              </StatusTag>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t(language, 'visualDisclaimer')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setPreferredMode('cloud_gemini')}
              className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap cursor-pointer ${
                preferredMode === 'cloud_gemini'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Cloud Vision (Gemini)
            </button>
            <button
              type="button"
              onClick={() => setPreferredMode('offline_edge')}
              className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap cursor-pointer ${
                preferredMode === 'offline_edge'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Offline Edge Mode
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer">
            <input
              type="checkbox"
              checked={storeHistory}
              onChange={(e) => setStoreHistory(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600"
            />
            Store History
          </label>
          <Link
            to="/scanner/history"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 whitespace-nowrap"
          >
            Inspection History <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {error && <AlertBanner tone="critical" title="Inspection Notice" message={error} />}

      {mode === 'batch' ? (
        <div className="space-y-5">
          {/* Batch Drag & Drop + Queue Manager */}
          <Panel>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-6 transition-colors ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Multi-Image Inspection Queue ({batchQueue.length > 0 ? `${batchQueue.length} uploaded` : '3 sample conveyor frames ready'})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Drag &amp; drop up to 10 waste images here, or run immediately on the 3 built-in benchmark frames.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap">
                    <Upload className="h-3.5 w-3.5" />
                    Add Images
                    <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
                  </label>
                  {batchQueue.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setBatchQueue([])}>
                      Clear Queue
                    </Button>
                  )}
                  <Button size="md" variant="primary" loading={loading} onClick={runBatchAnalysis}>
                    <Scan className="h-3.5 w-3.5" />
                    {loading ? 'Analyzing Batch...' : 'Run Batch Analysis'}
                  </Button>
                </div>
              </div>

              {loading && (
                <div className="mt-4">
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 mb-1">
                    <span>Processing batch pipeline...</span>
                    <span className="tabular-nums">{batchProgressPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${batchProgressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {batchQueue.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {batchQueue.map((item, idx) => (
                    <div
                      key={`${item.imageName}_${idx}`}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={item.imageBase64DataUrl}
                          alt={item.imageName}
                          className="w-8 h-8 rounded object-cover shrink-0 bg-slate-800"
                        />
                        <span className="text-[11px] font-medium truncate">{item.imageName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBatchQueue((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove ${item.imageName}`}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {batchResult ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Panel padding="p-4">
                  <div className="text-xs text-slate-500">Images Processed</div>
                  <div className="font-mono text-2xl font-bold tabular-nums mt-1">{batchResult.processedCount}</div>
                </Panel>
                <Panel padding="p-4">
                  <div className="text-xs text-slate-500">Total Objects Detected</div>
                  <div className="font-mono text-2xl font-bold tabular-nums mt-1">{batchResult.totalObjects}</div>
                </Panel>
                <Panel padding="p-4">
                  <div className="text-xs text-slate-500">Avg Recovery Score</div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                    {batchResult.avgRecoveryScore}/100
                  </div>
                </Panel>
                <Panel padding="p-4">
                  <div className="text-xs text-slate-500">Frames With Hazards</div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400 mt-1">
                    {batchResult.hazardFrames}
                  </div>
                </Panel>
              </div>

              {batchBreakdown.length > 0 && (
                <Panel>
                  <SectionHeader
                    title="Batch Material Breakdown"
                    subtitle="Aggregated resin/material counts and calibrated confidence across processed frames."
                    action={
                      <Button size="sm" variant="secondary" onClick={exportBatchCsv}>
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Export Batch CSV
                      </Button>
                    }
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {batchBreakdown.map((b) => (
                      <div key={b.code} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold">{b.code}</span>
                          <StatusTag tone={b.hazCount > 0 ? 'rose' : 'emerald'}>{b.count} obj</StatusTag>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                          Avg conf: {b.avgConf.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel padding="p-0" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-3 px-4">Image</th>
                        <th className="py-3 px-4">Provider</th>
                        <th className="py-3 px-4 text-right">Objects</th>
                        <th className="py-3 px-4 text-right">Readiness</th>
                        <th className="py-3 px-4 text-right">Recovery</th>
                        <th className="py-3 px-4">Safety / Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {batchResult.items.map((item) => (
                        <tr key={item.detectionRecordId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-medium">
                            <Link
                              to={`/scanner/result/${item.detectionRecordId}`}
                              className="text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                            >
                              {item.imageName}
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <StatusTag tone={item.inferenceProvider.includes('gemini') ? 'emerald' : 'neutral'}>
                              {item.inferenceProvider}
                            </StatusTag>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{item.objects.length}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{item.overallReadinessScore}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                            {item.overallRecoveryScore}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              {item.hasHazards ? (
                                <StatusTag tone="rose">HAZARD FLAGGED</StatusTag>
                              ) : (
                                <StatusTag tone="emerald">CLEAR</StatusTag>
                              )}
                              {item.needsHumanReview && <StatusTag tone="amber">QA REVIEW</StatusTag>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          ) : (
            <EmptyState
              icon={<Layers className="w-5 h-5" />}
              title="Batch Queue Ready"
              description="Add waste conveyor images above or click Run Batch Analysis to process the 3 built-in MRF sample frames."
            />
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Real-Time Detection Studio Telemetry Strip */}
          {mode === 'realtime' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Panel padding="p-3.5">
                <div className="text-[11px] text-slate-500">Camera Connection</div>
                <div className="text-sm font-bold mt-0.5 text-slate-900 dark:text-white">
                  {cameraActive ? 'Live Feed Active' : 'Standby / File Mode'}
                </div>
              </Panel>
              <Panel padding="p-3.5">
                <div className="text-[11px] text-slate-500">Stream Frames Analyzed</div>
                <div className="text-sm font-bold font-mono tabular-nums mt-0.5">{realtimeStats.frames}</div>
              </Panel>
              <Panel padding="p-3.5">
                <div className="text-[11px] text-slate-500">Tracked Objects (TRK)</div>
                <div className="text-sm font-bold font-mono tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {realtimeStats.totalObjs}
                </div>
              </Panel>
              <Panel padding="p-3.5">
                <div className="text-[11px] text-slate-500">Hazards in Session</div>
                <div className="text-sm font-bold font-mono tabular-nums mt-0.5 text-rose-600 dark:text-rose-400">
                  {realtimeStats.hazCount}
                </div>
              </Panel>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Canvas, Drag-and-Drop & Capture Controls */}
            <div className="lg:col-span-7 space-y-4">
              <Panel padding="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap">
                      <Upload className="h-3.5 w-3.5" />
                      {mode === 'realtime' ? 'Upload Video / Image' : 'Upload Image'}
                      <input
                        type="file"
                        accept={mode === 'realtime' ? 'image/*,video/*' : 'image/*'}
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <Button size="sm" variant={cameraActive ? 'danger' : 'secondary'} onClick={toggleWebcam}>
                      <Camera className="h-3.5 w-3.5" />
                      {cameraActive ? 'Disconnect Camera' : 'Connect Camera'}
                    </Button>
                    {cameraActive && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => captureWebcamFrame(true)}>
                          <Video className="h-3.5 w-3.5" />
                          Capture &amp; Analyze
                        </Button>
                        {mode === 'realtime' && (
                          <>
                            <select
                              value={captureIntervalSec}
                              onChange={(e) => setCaptureIntervalSec(Number(e.target.value))}
                              aria-label="Capture interval seconds"
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs font-mono"
                            >
                              <option value={2}>Every 2s</option>
                              <option value={5}>Every 5s</option>
                              <option value={10}>Every 10s</option>
                            </select>
                            <Button
                              size="sm"
                              variant={autoStreamRunning && !streamPaused ? 'warning' : 'primary'}
                              onClick={() => {
                                if (!autoStreamRunning) {
                                  setAutoStreamRunning(true);
                                  setStreamPaused(false);
                                } else {
                                  setStreamPaused((p) => !p);
                                }
                              }}
                            >
                              {autoStreamRunning && !streamPaused ? (
                                <>
                                  <Pause className="w-3.5 h-3.5" />
                                  Pause Loop
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5" />
                                  {autoStreamRunning ? 'Resume Loop' : 'Auto-Capture'}
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowPolygons((s) => !s)}>
                      <Layers className="h-3.5 w-3.5" />
                      {showPolygons ? 'Masks On' : 'Masks Off'}
                    </Button>
                    <Button size="sm" variant="primary" loading={loading} onClick={runSingleAnalysis}>
                      <Scan className="h-3.5 w-3.5" />
                      {loading ? 'Analyzing...' : t(language, 'runScan')}
                    </Button>
                  </div>
                </div>

                {cameraActive && (
                  <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-60 object-contain" />
                  </div>
                )}

                {/* Drag-and-Drop Viewport + Interactive Bounding Box & Segmentation Overlay */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`relative mt-3 rounded-xl overflow-hidden border-2 transition-colors bg-slate-950 ${
                    dragActive ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <img
                    src={selectedImageUrl}
                    alt={selectedFileName}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto block object-contain max-h-[440px]"
                  />
                  {dragActive && (
                    <div className="absolute inset-0 bg-emerald-950/70 flex items-center justify-center text-white text-sm font-semibold">
                      Drop waste image or video to inspect
                    </div>
                  )}
                  {result && (
                    <svg
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full pointer-events-auto"
                    >
                      {result.objects.map((obj) => {
                        const [ymin, xmin, ymax, xmax] = obj.bbox;
                        const color = statusColor(obj.recyclableStatus);
                        const isSel = selectedObj?.id === obj.id;
                        const polyPts = obj.segmentationPolygon.map((pt) => pt.join(',')).join(' ');
                        return (
                          <g key={obj.id} onClick={() => setSelectedObj(obj)} className="cursor-pointer">
                            {showPolygons && polyPts && (
                              <polygon
                                points={polyPts}
                                fill={color}
                                fillOpacity={isSel ? 0.25 : 0.12}
                                stroke={color}
                                strokeWidth={2}
                                strokeDasharray="6 4"
                              />
                            )}
                            <rect
                              x={xmin}
                              y={ymin}
                              width={Math.max(20, xmax - xmin)}
                              height={Math.max(20, ymax - ymin)}
                              fill="transparent"
                              stroke={color}
                              strokeWidth={isSel ? 6 : 3}
                            />
                            <rect
                              x={xmin}
                              y={Math.max(0, ymin - 34)}
                              width={Math.min(480, Math.max(190, obj.materialCode.length * 18 + 135))}
                              height={34}
                              fill={color}
                            />
                            <text
                              x={xmin + 8}
                              y={Math.max(22, ymin - 11)}
                              fill="#ffffff"
                              fontSize="20"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              {obj.trackId} · {obj.materialCode} ({Math.round(obj.calibratedConfidence * 100)}%)
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Active frame: <strong className="text-slate-700 dark:text-slate-200">{selectedFileName}</strong></span>
                  <span>Tip: Drag &amp; drop any waste photo onto the viewport above</span>
                </div>

                {/* Built-in Conveyor Samples */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                    Built-in Conveyor Inspection Samples:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {samples.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedImageUrl(s.dataUrl);
                          setSelectedFileName(s.fileName);
                          setResult(null);
                          setSelectedObj(null);
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          selectedFileName === s.fileName
                            ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                        }`}
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{s.title}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{s.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {videoFramesResult.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold mb-2">Tracked Video Keyframes</div>
                    <div className="flex flex-wrap gap-2">
                      {videoFramesResult.map((vf, idx) => (
                        <button
                          key={vf.detectionRecordId}
                          type="button"
                          onClick={() => {
                            setResult(vf);
                            setSelectedObj(vf.objects[0] || null);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono cursor-pointer hover:border-emerald-500"
                        >
                          Frame {idx + 1} ({vf.timestampSec}s) · {vf.objects.length} obj
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mode === 'realtime' && realtimeHistory.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-emerald-600" />
                      Real-Time Detection History ({realtimeHistory.length})
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {realtimeHistory.map((h) => (
                        <button
                          key={h.detectionRecordId}
                          type="button"
                          onClick={() => {
                            setResult(h);
                            setSelectedObj(h.objects[0] || null);
                          }}
                          className="w-full text-left px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                        >
                          <span className="font-mono truncate">{h.imageName}</span>
                          <span className="font-mono tabular-nums text-slate-500">
                            {h.objects.map((o) => o.trackId).join(', ')} · {h.overallRecoveryScore}% recov
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            {/* Right 9-Section Organized Inspection Breakdown */}
            <div className="lg:col-span-5 space-y-4">
              {result ? (
                <>
                  {result.isFallbackMode && (
                    <AlertBanner
                      tone="warning"
                      title="Inference Mode: Local Edge Heuristic Fallback"
                      message={result.fallbackReason || 'Running deterministic edge heuristic model.'}
                    />
                  )}

                  {/* Section 8: Safety Warnings */}
                  {result.hasHazards && (
                    <AlertBanner
                      tone="critical"
                      title="CRITICAL SAFETY WARNING: HAZARDOUS MATERIAL INDICATED"
                      message="Visual AI flagged lithium battery or chemical hazard indicators and queued Hazard Intelligence & Human Review. Do NOT compact or shred. Visual inspection is not chemical verification."
                    />
                  )}

                  {/* Section 1 & 6: Detection Summary + Readiness & Recovery Scores */}
                  <Panel>
                    <SectionHeader
                      title="1. Detection Summary & Scores"
                      subtitle={`${result.inferenceProvider} · ${result.inferenceLatencyMs} ms`}
                      action={
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/scanner/result/${result.detectionRecordId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:border-emerald-500 whitespace-nowrap"
                          >
                            Full Page <ArrowRight className="w-3 h-3" />
                          </Link>
                          <Button size="sm" variant="secondary" onClick={exportScanPdf}>
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                        </div>
                      }
                    />

                    <div className="grid grid-cols-3 gap-2.5 text-xs mb-4">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                        <div className="text-[11px] text-slate-500">Objects</div>
                        <div className="font-mono text-lg font-bold tabular-nums mt-0.5">{result.objects.length}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                        <div className="text-[11px] text-slate-500">Readiness</div>
                        <div className="font-mono text-lg font-bold tabular-nums mt-0.5">
                          {result.overallReadinessScore}/100
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                        <div className="text-[11px] text-slate-500">Recovery</div>
                        <div className="font-mono text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {result.overallRecoveryScore}/100
                        </div>
                      </div>
                    </div>

                    {result.policyApplied && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                        Policy Applied:{' '}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{result.policyApplied.title}</span>{' '}
                        ({result.policyApplied.origin})
                      </div>
                    )}

                    {/* Section 2: Identified Materials */}
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      2. Identified Materials (Select object to inspect)
                    </div>
                    <div className="space-y-2">
                      {result.objects.map((obj) => (
                        <button
                          key={obj.id}
                          type="button"
                          onClick={() => setSelectedObj(obj)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                            selectedObj?.id === obj.id
                              ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/25'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {obj.trackId} · {obj.label}
                            </span>
                            <StatusTag
                              tone={
                                obj.recyclableStatus === 'recyclable'
                                  ? 'emerald'
                                  : obj.recyclableStatus === 'hazardous'
                                    ? 'rose'
                                    : obj.recyclableStatus === 'conditional'
                                      ? 'amber'
                                      : 'neutral'
                              }
                            >
                              {obj.materialCode} · {Math.round(obj.calibratedConfidence * 100)}%
                            </StatusTag>
                          </div>
                          {obj.isLowConfidence && (
                            <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                              Low Confidence (&lt;65%) — Routed to Human Review Queue
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </Panel>

                  {/* Sections 3–9 Detailed Object Inspection */}
                  {selectedObj && (
                    <Panel className="space-y-3.5 text-xs">
                      <SectionHeader
                        title={`Object Breakdown · ${selectedObj.trackId}`}
                        subtitle={selectedObj.fineGrainedType}
                        badge={
                          <Link to={`/materials/${encodeURIComponent(selectedObj.materialCode)}`}>
                            <StatusTag tone="teal">{selectedObj.materialCode} ↗</StatusTag>
                          </Link>
                        }
                      />

                      {/* Section 3: AI Confidence Bar */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">3. Calibrated AI Confidence</span>
                          <span className="font-mono font-bold tabular-nums">
                            {(selectedObj.calibratedConfidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              selectedObj.isLowConfidence ? 'bg-amber-500' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${Math.round(selectedObj.calibratedConfidence * 100)}%` }}
                          />
                        </div>
                        {selectedObj.isLowConfidence && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 font-medium">
                            Confidence below 0.65 gate. Human verification required before final baling.
                          </p>
                        )}
                      </div>

                      {/* Section 4: Contamination Details */}
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                          <span>4. Contamination Details</span>
                          <StatusTag
                            tone={
                              selectedObj.contamination.severity === 'high' || selectedObj.contamination.severity === 'critical'
                                ? 'rose'
                                : selectedObj.contamination.severity === 'none'
                                  ? 'emerald'
                                  : 'amber'
                            }
                          >
                            {selectedObj.contamination.purityEstimatePct}% purity
                          </StatusTag>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">
                          {selectedObj.contamination.contaminationType} — {selectedObj.contamination.description}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Remediation: {selectedObj.contamination.remediationAction}
                        </p>
                      </div>

                      {/* Section 5 & 7: Recyclability Status & Recommended Sorting Stream */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] text-slate-500">5. Recyclability Status</div>
                          <div className="font-semibold text-slate-900 dark:text-white mt-0.5 uppercase">
                            {selectedObj.recyclableStatus.replace('_', ' ')}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">{selectedObj.recyclabilityReason}</p>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] text-slate-500">7. Recommended Sorting Stream</div>
                          <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            {selectedObj.recommendedChute}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">{selectedObj.separationAdvice}</p>
                        </div>
                      </div>

                      {/* Section 8: Object Safety Warnings */}
                      {selectedObj.hazard.isHazardous && (
                        <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 space-y-1">
                          <div className="font-semibold flex items-center gap-1.5">
                            <ShieldAlert className="w-4 h-4 text-rose-600" />
                            8. Safety Warning ({selectedObj.hazard.hazardType})
                          </div>
                          <p>{selectedObj.hazard.warningMessage}</p>
                          <p className="text-[11px] font-medium">
                            Isolation: {selectedObj.hazard.isolationRecommendation}
                          </p>
                        </div>
                      )}

                      {/* Section 9: AI Explanation */}
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5 text-emerald-600" />
                          9. AI Visual Explanation
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{selectedObj.explanation}</p>
                        <div className="text-[11px] text-slate-500">
                          <strong>Observed Visual Cues:</strong> {selectedObj.visualCues.join(' · ')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          <strong>Packaging:</strong> {selectedObj.packagingType} · Multi-layer:{' '}
                          {selectedObj.isMultilayer ? 'Yes' : 'No'} · Reuse: {selectedObj.reusePotential}
                        </div>
                      </div>
                    </Panel>
                  )}
                </>
              ) : (
                <Panel padding="p-8">
                  <EmptyState
                    icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                    title="Inspection Studio Ready"
                    description="Select a sample conveyor frame, drag & drop an image/video, or connect your camera, then click Analyze Waste Frame."
                    action={
                      <Button size="sm" variant="primary" loading={loading} onClick={runSingleAnalysis}>
                        <Scan className="w-3.5 h-3.5" />
                        Analyze Active Frame
                      </Button>
                    }
                  />
                </Panel>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
