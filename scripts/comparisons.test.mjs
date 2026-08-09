import test from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, pickComparison, formatComparison } from '../src/model/comparisons.ts';

const PLURALS = {
  drop: 'drops',
  teaspoon: 'teaspoons',
  tablespoon: 'tablespoons',
  cup: 'cups',
  'water bottle': 'water bottles',
  almond: 'almonds',
  'toilet flush': 'toilet flushes',
  '8-minute shower': '8-minute showers',
  'washing-machine load': 'washing-machine loads',
  'cup of coffee': 'cups of coffee',
  hamburger: 'hamburgers',
  'pair of jeans': 'pairs of jeans',
};

function closeTo(actual, expected, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be within ${eps} of ${expected}`);
}

test('6.8 mL everyday picks teaspoon with multiple 1.36', () => {
  const { rung, multiple } = pickComparison(6.8, 'everyday');
  assert.equal(rung.name, 'teaspoon');
  closeTo(multiple, 1.36);
});

test('6.8 mL everyday formats as one teaspoon', () => {
  assert.equal(formatComparison(6.8, 'everyday'), 'one teaspoon');
});

test('1700 mL everyday picks water bottle with multiple 3.4', () => {
  const { rung, multiple } = pickComparison(1700, 'everyday');
  assert.equal(rung.name, 'water bottle');
  closeTo(multiple, 3.4);
});

test('1700 mL everyday formats as 3 water bottles', () => {
  assert.equal(formatComparison(1700, 'everyday'), '3 water bottles');
});

test('0.1 mL everyday formats as less than one drop, never a tiny shower count', () => {
  assert.equal(formatComparison(0.1, 'everyday'), 'less than one drop');
});

test('0.4 mL food formats as less than one drop (food has no rung below drop)', () => {
  assert.equal(formatComparison(0.4, 'food'), 'less than one drop');
});

test('every rung carries a non-empty source', () => {
  for (const r of LADDER) {
    assert.ok(r.source.trim().length > 0, `rung ${r.name} must carry a source`);
  }
});

test('every comparison rung uses its packaged comparison image', () => {
  const imageFiles = {
    drop: 'drop',
    teaspoon: 'teaspoon',
    tablespoon: 'tablespoon',
    cup: 'cup',
    'water bottle': 'water-bottle',
    almond: 'almond',
    'toilet flush': 'toilet-flush',
    '8-minute shower': 'shower',
    'washing-machine load': 'washing-machine',
    'cup of coffee': 'coffee',
    hamburger: 'hamburger',
    'pair of jeans': 'jeans',
  };

  for (const rung of LADDER) {
    assert.equal(rung.image, `/comparison-images/${imageFiles[rung.name]}.png`);
  }
});

test('food set excludes the household rungs', () => {
  const names = LADDER.filter((r) => r.set === 'food' || r.set === 'all').map((r) => r.name);
  assert.ok(!names.includes('toilet flush'));
  assert.ok(!names.includes('8-minute shower'));
  assert.ok(!names.includes('washing-machine load'));
  assert.ok(!names.includes('pair of jeans'));
});

test('household set excludes the food rungs', () => {
  const names = LADDER.filter((r) => r.set === 'household' || r.set === 'all').map((r) => r.name);
  assert.ok(!names.includes('almond'));
  assert.ok(!names.includes('cup of coffee'));
  assert.ok(!names.includes('hamburger'));
});

test('exactly 5 mL everyday reads as one teaspoon', () => {
  const { rung, multiple } = pickComparison(5, 'everyday');
  assert.equal(rung.name, 'teaspoon');
  assert.equal(multiple, 1);
  assert.equal(formatComparison(5, 'everyday'), 'one teaspoon');
});

test('8000000 mL household picks jeans and formats as one pair of jeans', () => {
  const { rung, multiple } = pickComparison(8000000, 'household');
  assert.equal(rung.name, 'pair of jeans');
  assert.ok(multiple > 1 && multiple < 2, `multiple ${multiple} in (1,2)`);
  assert.equal(formatComparison(8000000, 'household'), 'one pair of jeans');
});

test('integer multiples read plain: 12000 mL everyday → 24 water bottles', () => {
  assert.equal(formatComparison(12000, 'everyday'), '24 water bottles');
});

test('integer multiples ≥10 read plain and whole: 2000000 mL household → 20 washing-machine loads', () => {
  assert.equal(formatComparison(2000000, 'household'), '20 washing-machine loads');
});

test('round-trip: every rung at exactly its valueMl reads as one <name>', () => {
  for (const r of LADDER) {
    const set = r.set === 'all' ? 'everyday' : r.set;
    assert.equal(formatComparison(r.valueMl, set), `one ${r.name}`, `exact ${r.valueMl} mL (${set})`);
  }
});

test('round-trip: every rung at 1.5× valueMl rounds to two plural items', () => {
  for (const r of LADDER) {
    const set = r.set === 'all' ? 'everyday' : r.set;
    // 1.5× stays under the next rung, so closest-below still picks this rung
    assert.equal(formatComparison(r.valueMl * 1.5, set), `2 ${PLURALS[r.name]}`, `1.5× ${r.valueMl} mL (${set})`);
  }
});
