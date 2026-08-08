import type { CoeffSet, CoefficientVersion } from './coefficients.ts';
import type { EnergyTier, Settings, WueSetting } from '../storage/schema.ts';
import type { ScenarioCoeffs, ScenarioSet } from './estimate.ts';

const ENERGY_TIER_COL: Record<EnergyTier, 'low' | 'mid' | 'high'> = {
  efficient: 'low', mid: 'mid', legacy: 'high',
};

const WUE_COL: Record<WueSetting, 'low' | 'mid' | 'high'> = {
  best: 'low', fleet: 'mid', industry: 'high',
};

function pick(set: CoeffSet, tier: 'low' | 'mid' | 'high'): number {
  return set[tier];
}

export function buildScenarios(c: CoefficientVersion, settings: Settings): ScenarioSet {
  const energyCol = ENERGY_TIER_COL[settings.energyTier];
  const wueCol = WUE_COL[settings.wue];
  const make = (energy: 'low' | 'mid' | 'high', wue: 'low' | 'mid' | 'high', accounting: ScenarioCoeffs['accounting']): ScenarioCoeffs => ({
    whBase: pick(c.whBase, energy),
    whPerToken: pick(c.whPerToken, energy),
    reasoningMultiplier: pick(c.reasoningMultiplier, energy),
    wueDc: pick(c.wueDc, wue),
    ewifGrid: pick(c.ewifGrid, wue),
    accounting,
  });
  return {
    low: make('low', 'low', 'onsite'),
    mid: make(energyCol, wueCol, settings.accountingMode),
    high: make('high', 'high', 'total'),
  };
}
