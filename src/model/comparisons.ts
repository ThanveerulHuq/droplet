import type { ComparisonSet } from '../storage/schema.ts';

export type { ComparisonSet };

export interface ComparisonRung {
  valueMl: number;
  name: string;
  set: ComparisonSet | 'all';
  source: string;
}

// R7.3: the whole ladder lives in one data file so it can be localised and swapped.
// Food-footprint rungs are lifecycle numbers and must stay labelled as such (R7.1).
export const LADDER: ComparisonRung[] = [
  { valueMl: 0.5, name: 'drop', set: 'all', source: 'standard measurement unit' },
  { valueMl: 5, name: 'teaspoon', set: 'all', source: 'standard measurement unit' },
  { valueMl: 15, name: 'tablespoon', set: 'all', source: 'standard measurement unit' },
  { valueMl: 250, name: 'cup', set: 'all', source: 'standard measurement unit' },
  { valueMl: 500, name: 'water bottle', set: 'all', source: 'standard measurement unit' },
  { valueMl: 4000, name: 'almond', set: 'food', source: 'lifecycle, see METHODOLOGY.md' },
  { valueMl: 6000, name: 'toilet flush', set: 'household', source: 'typical fixture, see METHODOLOGY.md' },
  { valueMl: 50000, name: '8-minute shower', set: 'household', source: 'typical fixture, see METHODOLOGY.md' },
  { valueMl: 100000, name: 'washing-machine load', set: 'household', source: 'typical fixture, see METHODOLOGY.md' },
  { valueMl: 140000, name: 'cup of coffee', set: 'food', source: 'lifecycle, see METHODOLOGY.md' },
  { valueMl: 2400000, name: 'hamburger', set: 'food', source: 'lifecycle, see METHODOLOGY.md' },
  { valueMl: 7600000, name: 'pair of jeans', set: 'household', source: 'lifecycle, see METHODOLOGY.md' },
];

const IRREGULAR_PLURALS: Record<string, string> = {
  'cup of coffee': 'cups of coffee',
  'pair of jeans': 'pairs of jeans',
  'toilet flush': 'toilet flushes',
};

function pluralize(name: string): string {
  return IRREGULAR_PLURALS[name] ?? `${name}s`;
}

export function pickComparison(estimateMl: number, set: ComparisonSet): { rung: ComparisonRung; multiple: number } {
  const rungs = LADDER.filter((r) => r.set === 'all' || r.set === set).sort((a, b) => a.valueMl - b.valueMl);
  const below = rungs.filter((r) => r.valueMl <= estimateMl);
  // LADDER always contains the 'all' drop rung, so rungs is never empty and the picks exist.
  const rung = below.length > 0 ? below[below.length - 1]! : rungs[0]!;
  return { rung, multiple: estimateMl / rung.valueMl };
}

export function formatComparison(estimateMl: number, set: ComparisonSet): string {
  const { rung, multiple } = pickComparison(estimateMl, set);
  if (multiple < 1) return `less than one ${rung.name}`;
  const rounded = Math.round(multiple * 10) / 10;
  if (rounded === 1) return `one ${rung.name}`;
  if (rounded >= 10) return `${Math.round(rounded)} ${pluralize(rung.name)}`;
  if (Number.isInteger(rounded)) return `${rounded} ${pluralize(rung.name)}`;
  return `≈${rounded} ${pluralize(rung.name)}`;
}
