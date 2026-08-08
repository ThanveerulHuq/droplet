import test from 'node:test';
import assert from 'node:assert/strict';
import { COEFFICIENTS, COEFFICIENT_SOURCES, MEDIAN_RESPONSE_TOKENS } from '../src/model/coefficients.ts';

const SET_KEYS = ['whBase', 'whPerToken', 'reasoningMultiplier', 'wueDc', 'ewifGrid'];

test('calibration: a 300-token response at Mid is ~Google\u2019s 0.24 Wh', () => {
  // whBase.mid + 300 * whPerToken.mid = 0.05 + 300 * 0.00063 = 0.05 + 0.189 = 0.239
  const wh = COEFFICIENTS.whBase.mid + 300 * COEFFICIENTS.whPerToken.mid;
  assert.ok(Math.abs(wh - 0.24) < 0.01, `computed ${wh} Wh, expected within 0.01 of 0.24`);
});

test('low <= mid <= high for every CoeffSet', () => {
  for (const key of SET_KEYS) {
    const set = COEFFICIENTS[key];
    assert.ok(set.low <= set.mid, `${key}: low ${set.low} <= mid ${set.mid}`);
    assert.ok(set.mid <= set.high, `${key}: mid ${set.mid} <= high ${set.high}`);
  }
});

test('all coefficient values are finite positive numbers', () => {
  for (const key of SET_KEYS) {
    for (const v of Object.values(COEFFICIENTS[key])) {
      assert.ok(Number.isFinite(v) && v > 0, `${key}: ${v} must be finite and positive`);
    }
  }
  assert.ok(Number.isInteger(COEFFICIENTS.medianResponseTokens) && COEFFICIENTS.medianResponseTokens > 0);
});

test('COEFFICIENT_SOURCES has a labelled entry for every coefficient key', () => {
  for (const key of Object.keys(COEFFICIENTS)) {
    const sources = COEFFICIENT_SOURCES[key];
    assert.ok(Array.isArray(sources) && sources.length > 0, `sources missing for ${key}`);
    for (const s of sources) {
      assert.ok(typeof s.label === 'string' && s.label.trim().length > 0, `${key}: empty source label`);
    }
  }
});

test('MEDIAN_RESPONSE_TOKENS is 75 and matches the versioned coefficient', () => {
  assert.equal(MEDIAN_RESPONSE_TOKENS, 75);
  assert.equal(MEDIAN_RESPONSE_TOKENS, COEFFICIENTS.medianResponseTokens);
});
