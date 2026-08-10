import type { Counters, ProviderId, Settings, Store } from '../storage/schema.ts';
import { emptyCounters, addCounters } from '../storage/schema.ts';
import { estimateBand } from './estimate.ts';
import { buildScenarios } from './scenarios.ts';
import { COEFFICIENTS } from './coefficients.ts';
import { formatComparison, pickComparison } from './comparisons.ts';
import { formatVolume } from '../lib/units.ts';
import type { Band } from './estimate.ts';
import type { ScopeView } from './popup.ts';
import { estimatedRatio } from './aggregate.ts';

export const PACE_FACTORS: Record<'week' | 'month', number> = { week: 7, month: 30 };

// --- helpers pure ---

export function scaleCounters(counters: Counters, factor: number): Counters {
  return {
    turns: Math.round(counters.turns * factor),
    tokensOut: Math.round(counters.tokensOut * factor),
    reasoningTurns: Math.round(counters.reasoningTurns * factor),
    estimatedTurns: Math.round(counters.estimatedTurns * factor),
  };
}

function sumDayCounters(day: Partial<Record<ProviderId, Counters>> | undefined): Counters {
  if (!day) return emptyCounters();
  let total = emptyCounters();
  for (const c of Object.values(day)) {
    if (c) total = addCounters(total, c);
  }
  return total;
}

export function activeDayKeys(store: Store): string[] {
  return Object.keys(store.days).filter((k) => {
    const total = sumDayCounters(store.days[k]);
    return total.turns > 0;
  });
}

export function countActiveDays(store: Store): number {
  return activeDayKeys(store).length;
}

export function hasFullMonthData(store: Store): boolean {
  return countActiveDays(store) >= 30;
}

export function totalActiveCounters(store: Store): Counters {
  let total = emptyCounters();
  for (const k of activeDayKeys(store)) {
    total = addCounters(total, sumDayCounters(store.days[k]));
  }
  return total;
}

export function projectedCountersFromAverage(
  total: Counters,
  activeDays: number,
  scope: 'week' | 'month',
): Counters | null {
  if (activeDays === 0 || total.turns === 0) return null;
  const factor = PACE_FACTORS[scope];
  // average * factor  == total * factor / activeDays  (rounded)
  return {
    turns: Math.round((total.turns * factor) / activeDays),
    tokensOut: Math.round((total.tokensOut * factor) / activeDays),
    reasoningTurns: Math.round((total.reasoningTurns * factor) / activeDays),
    estimatedTurns: Math.round((total.estimatedTurns * factor) / activeDays),
  };
}

export interface PaceProjection {
  scope: 'week' | 'month';
  activeDays: number;
  total: Counters;
  projected: Counters;
  band: Band;
  volumeLabel: string;
  comparisonLabel: string;
  bandLabel: string;
  provider: ProviderId[];
  // view ready to render via appendView (replace main reading)
  view: ScopeView;
}

/**
 * Build a pace projection using the average of all collected days.
 * Returns null when:
 *  - month data is already complete (>=30 active days) -> no projection needed
 *  - no active days collected yet
 */
export function buildPaceProjection(
  store: Store,
  settings: Settings,
  scope: 'week' | 'month',
  _now = Date.now(),
): PaceProjection | null {
  if (hasFullMonthData(store)) return null;

  const activeDays = countActiveDays(store);
  if (activeDays === 0) return null;

  const total = totalActiveCounters(store);
  const projected = projectedCountersFromAverage(total, activeDays, scope);
  if (!projected) return null;

  const scenarios = buildScenarios(COEFFICIENTS, settings);
  const band = estimateBand(projected, scenarios);
  const low = formatVolume(band.low, settings.units);
  const high = formatVolume(band.high, settings.units);

  // providers from active days
  const providerSet = new Set<ProviderId>();
  for (const k of activeDayKeys(store)) {
    const day = store.days[k];
    if (!day) continue;
    for (const pid of Object.keys(day) as ProviderId[]) {
      if (day[pid]) providerSet.add(pid);
    }
  }
  const provider = [...providerSet];

  const primary = { ...pickComparison(band.mid, settings.comparisonSet), label: formatComparison(band.mid, settings.comparisonSet) };
  const secondary = settings.comparisonSet === 'food' ? null : { ...pickComparison(band.mid, 'food'), label: formatComparison(band.mid, 'food') };

  const view: ScopeView = {
    counters: projected,
    band,
    primary,
    secondary,
    provider,
    estimatedRatio: estimatedRatio(projected),
    volumeLabel: formatVolume(band.mid, settings.units),
  };

  return {
    scope,
    activeDays,
    total,
    projected,
    band,
    volumeLabel: view.volumeLabel,
    comparisonLabel: primary.label,
    bandLabel: `${low} – ${high}`,
    provider,
    view,
  };
}

// Back-compat alias for old today-only logic (unused now but kept for tests)
export function paceBandFromToday(
  today: Counters,
  scope: 'week' | 'month',
  settings: Settings,
): Band | null {
  if (today.turns === 0) return null;
  const projected = scaleCounters(today, PACE_FACTORS[scope]);
  return estimateBand(projected, buildScenarios(COEFFICIENTS, settings));
}
