export interface TwinStageInput {
  id: string;
  name: string;
  capacityTph: number;
  currentLoadTph: number;
  contaminationRisk: number;
  recoveryEff: number;
}

export interface SimulationParams {
  infeedRateTph: number;
  beltSpeedMps: number;
  confidenceThreshold: number;
  opticalAirJetBoostPct: number;
  manualQcStaffCount: number;
  incomingContaminationPct: number;
}

export interface SimulationOutput {
  isSimulation: true;
  assumptionsText: string;
  projectedRecoveryRatePct: number;
  projectedPurityPct: number;
  projectedRejectRatePct: number;
  projectedThroughputTph: number;
  bottleneckStage: string;
  hotspotStage: string;
  stageFlows: Array<{
    stageId: string;
    stageName: string;
    loadTph: number;
    utilizationPct: number;
    stageRecoveryPct: number;
    contaminationHotspotScore: number;
    isBottleneck: boolean;
  }>;
  predictiveNext7Days: Array<{
    day: string;
    predictedRecoveryPct: number;
    predictedContaminationPct: number;
  }>;
}

export function runSortingSimulation(
  stages: TwinStageInput[],
  params: SimulationParams
): SimulationOutput {
  const speedPenalty = params.beltSpeedMps > 2.2 ? (params.beltSpeedMps - 2.2) * 4.5 : 0;
  const thresholdBoost = (params.confidenceThreshold - 0.65) * 14; // stricter threshold improves purity, slightly lowers capture
  const staffBonus = Math.min(8, params.manualQcStaffCount * 1.4);
  const airJetBoost = params.opticalAirJetBoostPct * 0.12;

  let currentMassTph = params.infeedRateTph;
  let bottleneckStage = stages[0]?.name || 'Infeed';
  let maxUtil = 0;
  let hotspotStage = stages[0]?.name || 'Pre-Sort';
  let maxHotspot = 0;

  const stageFlows = stages.map((stg, idx) => {
    const loadTph = Number(Math.max(0.5, currentMassTph).toFixed(2));
    const utilizationPct = Number(((loadTph / Math.max(1, stg.capacityTph)) * 100).toFixed(1));
    const overloadPenalty = utilizationPct > 100 ? (utilizationPct - 100) * 0.25 : 0;

    let stageEff = stg.recoveryEff * 100 - speedPenalty - overloadPenalty;
    if (stg.id.includes('nir') || stg.id.includes('qc')) {
      stageEff += airJetBoost + (idx === 5 ? staffBonus * 0.5 : 0);
    }
    stageEff = Math.max(55, Math.min(99.2, stageEff));

    const hotspotScore = Number(
      Math.min(100, stg.contaminationRisk * 100 + params.incomingContaminationPct * 1.1 + overloadPenalty * 0.8 - staffBonus * 0.7).toFixed(1)
    );

    if (utilizationPct > maxUtil) {
      maxUtil = utilizationPct;
      bottleneckStage = stg.name;
    }
    if (hotspotScore > maxHotspot) {
      maxHotspot = hotspotScore;
      hotspotStage = stg.name;
    }

    currentMassTph = loadTph * (stageEff / 100) * 0.96;

    return {
      stageId: stg.id,
      stageName: stg.name,
      loadTph,
      utilizationPct,
      stageRecoveryPct: Number(stageEff.toFixed(1)),
      contaminationHotspotScore: Math.max(2, hotspotScore),
      isBottleneck: utilizationPct > 92,
    };
  });

  const baseRecovery = 88 - params.incomingContaminationPct * 0.55 - speedPenalty - Math.max(0, (params.confidenceThreshold - 0.72) * 18) + airJetBoost * 0.6 + staffBonus * 0.45;
  const projectedRecoveryRatePct = Number(Math.max(45, Math.min(96.5, baseRecovery)).toFixed(1));

  const basePurity = 95.5 - params.incomingContaminationPct * 0.35 + thresholdBoost + staffBonus * 0.35 - speedPenalty * 0.4;
  const projectedPurityPct = Number(Math.max(70, Math.min(99.2, basePurity)).toFixed(1));

  const projectedRejectRatePct = Number(Math.max(3, 100 - projectedRecoveryRatePct).toFixed(1));
  const projectedThroughputTph = Number((params.infeedRateTph * (projectedRecoveryRatePct / 100)).toFixed(2));

  const predictiveNext7Days = ['Day +1', 'Day +2', 'Day +3', 'Day +4', 'Day +5', 'Day +6', 'Day +7'].map((day, idx) => ({
    day,
    predictedRecoveryPct: Number((projectedRecoveryRatePct + Math.sin(idx * 0.9) * 0.8).toFixed(1)),
    predictedContaminationPct: Number(Math.max(2, params.incomingContaminationPct - idx * 0.22).toFixed(1)),
  }));

  return {
    isSimulation: true,
    assumptionsText:
      'MODELED SIMULATION ONLY (Not measured plant output): Assumes steady-state material density, linear air-jet recovery elasticity, and baseline incoming contamination ratio.',
    projectedRecoveryRatePct,
    projectedPurityPct,
    projectedRejectRatePct,
    projectedThroughputTph,
    bottleneckStage,
    hotspotStage,
    stageFlows,
    predictiveNext7Days,
  };
}
