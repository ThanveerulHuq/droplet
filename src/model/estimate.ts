import type { Counters } from '../storage/schema.ts';

export interface ScenarioCoeffs {
  whBase: number;
  whPerToken: number;
  reasoningMultiplier: number;
  wueDc: number;
  ewifGrid: number;
  accounting: 'onsite' | 'total';
}

export interface ScenarioSet { low: ScenarioCoeffs; mid: ScenarioCoeffs; high: ScenarioCoeffs; }

export interface Band { low: number; mid: number; high: number; }

export function energyWh(counters: Counters, c: ScenarioCoeffs): number {
  const share = counters.turns > 0 ? counters.reasoningTurns / counters.turns : 0;
  const mult = 1 + share * (c.reasoningMultiplier - 1);
  return (counters.turns * c.whBase + counters.tokensOut * c.whPerToken) * mult;
}

export function waterMl(energyWhValue: number, c: ScenarioCoeffs): number {
  const onsite = energyWhValue * c.wueDc;
  return c.accounting === 'onsite' ? onsite : onsite + energyWhValue * c.ewifGrid;
}

export function estimateBand(counters: Counters, scenarios: ScenarioSet): Band {
  const f = (s: ScenarioCoeffs) => waterMl(energyWh(counters, s), s);
  return { low: f(scenarios.low), mid: f(scenarios.mid), high: f(scenarios.high) };
}
