import test from 'node:test';
import assert from 'node:assert/strict';
import { COEFFICIENTS } from '../src/model/coefficients.ts';
import { DEFAULT_SETTINGS, emptyCounters } from '../src/storage/schema.ts';
import { energyWh, waterMl, estimateBand } from '../src/model/estimate.ts';
import { buildScenarios } from '../src/model/scenarios.ts';

function closeTo(actual, expected, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be within ${eps} of ${expected}`);
}

// 42-turn chat with 300 output tokens per turn: tokensOut = 42 * 300 = 12600
const counters = { turns: 42, tokensOut: 12600, reasoningTurns: 0, estimatedTurns: 0 };

test('estimateBand: low <= mid <= high for DEFAULT_SETTINGS', () => {
  const band = estimateBand(counters, buildScenarios(COEFFICIENTS, DEFAULT_SETTINGS));
  assert.ok(band.low <= band.mid, `low ${band.low} <= mid ${band.mid}`);
  assert.ok(band.mid <= band.high, `mid ${band.mid} <= high ${band.high}`);
});

test('estimateBand: low <= mid <= high for legacy/industry settings', () => {
  const settings = { ...DEFAULT_SETTINGS, energyTier: 'legacy', wue: 'industry' };
  const band = estimateBand(counters, buildScenarios(COEFFICIENTS, settings));
  assert.ok(band.low <= band.mid, `low ${band.low} <= mid ${band.mid}`);
  assert.ok(band.mid <= band.high, `mid ${band.mid} <= high ${band.high}`);
});

test('estimateBand: zero counters yields an all-zero band', () => {
  const band = estimateBand(emptyCounters(), buildScenarios(COEFFICIENTS, DEFAULT_SETTINGS));
  assert.equal(band.low, 0);
  assert.equal(band.mid, 0);
  assert.equal(band.high, 0);
});

test('estimateBand: hand-computed mid for a 42-turn 300-token chat is 56.2128 mL', () => {
  // mid scenario (DEFAULT_SETTINGS): whBase.mid=0.05, whPerToken.mid=0.00063,
  // wueDc.mid=1.1, ewifGrid.mid=4.5, accounting 'total', reasoningMultiplier.mid=3, share=0 -> mult=1
  // energy = 42*0.05 + 12600*0.00063 = 2.1 + 7.938 = 10.038 Wh
  // water  = 10.038*1.1 + 10.038*4.5 = 11.0418 + 45.171 = 56.2128 mL
  const scenarios = buildScenarios(COEFFICIENTS, DEFAULT_SETTINGS);
  closeTo(energyWh(counters, scenarios.mid), 10.038);
  closeTo(waterMl(10.038, scenarios.mid), 56.2128);
  closeTo(estimateBand(counters, scenarios).mid, 56.2128);
});

test('accounting: onsite mid is strictly less than total mid', () => {
  const onsite = { ...DEFAULT_SETTINGS, accountingMode: 'onsite' };
  const midOnsite = estimateBand(counters, buildScenarios(COEFFICIENTS, onsite)).mid;
  const midTotal = estimateBand(counters, buildScenarios(COEFFICIENTS, DEFAULT_SETTINGS)).mid;
  assert.ok(midOnsite < midTotal, `onsite ${midOnsite} < total ${midTotal}`);
});

test('buildScenarios: legacy/industry settings raise the MID estimate above default', () => {
  const legacy = { ...DEFAULT_SETTINGS, energyTier: 'legacy', wue: 'industry' };
  const midDefault = estimateBand(counters, buildScenarios(COEFFICIENTS, DEFAULT_SETTINGS)).mid;
  const midLegacy = estimateBand(counters, buildScenarios(COEFFICIENTS, legacy)).mid;
  assert.ok(midLegacy > midDefault, `legacy ${midLegacy} > default ${midDefault}`);
});

test('buildScenarios: mid scenario uses the settings-selected columns', () => {
  const s = buildScenarios(COEFFICIENTS, DEFAULT_SETTINGS);
  assert.equal(s.mid.whBase, COEFFICIENTS.whBase.mid);
  assert.equal(s.mid.whPerToken, COEFFICIENTS.whPerToken.mid);
  assert.equal(s.mid.reasoningMultiplier, COEFFICIENTS.reasoningMultiplier.mid);
  assert.equal(s.mid.wueDc, COEFFICIENTS.wueDc.mid);
  assert.equal(s.mid.ewifGrid, COEFFICIENTS.ewifGrid.mid);
  assert.equal(s.mid.accounting, 'total');
});

test('buildScenarios: low and high scenarios are identical regardless of settings', () => {
  const legacy = { ...DEFAULT_SETTINGS, energyTier: 'legacy', wue: 'industry' };
  const a = buildScenarios(COEFFICIENTS, DEFAULT_SETTINGS);
  const b = buildScenarios(COEFFICIENTS, legacy);
  assert.deepEqual(a.low, b.low);
  assert.deepEqual(a.high, b.high);
  assert.deepEqual(a.low, {
    whBase: COEFFICIENTS.whBase.low,
    whPerToken: COEFFICIENTS.whPerToken.low,
    reasoningMultiplier: COEFFICIENTS.reasoningMultiplier.low,
    wueDc: COEFFICIENTS.wueDc.low,
    ewifGrid: COEFFICIENTS.ewifGrid.low,
    accounting: 'onsite',
  });
  assert.deepEqual(a.high, {
    whBase: COEFFICIENTS.whBase.high,
    whPerToken: COEFFICIENTS.whPerToken.high,
    reasoningMultiplier: COEFFICIENTS.reasoningMultiplier.high,
    wueDc: COEFFICIENTS.wueDc.high,
    ewifGrid: COEFFICIENTS.ewifGrid.high,
    accounting: 'total',
  });
});
