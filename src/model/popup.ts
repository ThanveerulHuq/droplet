import type { Counters, ProviderId, Settings, Store } from '../storage/schema.ts';
import type { ConversationScan } from '../adapters/types.ts';
import type { Scope } from './aggregate.ts';
import { estimatedRatio, scopeCounters } from './aggregate.ts';
import type { Band } from './estimate.ts';
import { estimateBand } from './estimate.ts';
import type { ComparisonRung } from './comparisons.ts';
import { formatComparison, pickComparison } from './comparisons.ts';
import { COEFFICIENTS } from './coefficients.ts';
import { buildScenarios } from './scenarios.ts';
import { formatVolume } from '../lib/units.ts';
import { toDateKey } from '../storage/ingest.ts';

export interface Comparison {
  rung: ComparisonRung;
  multiple: number;
  label: string;
}

export interface ScopeView {
  counters: Counters | null;
  band: Band;
  primary: Comparison;
  secondary: Comparison | null;
  provider: ProviderId[];
  estimatedRatio: number;
  volumeLabel: string;
}

function scopeDayKeys(store: Store, scope: Scope, now: number): string[] {
  switch (scope) {
    case 'today':
      return [toDateKey(now)];
    case 'week': {
      const keys: string[] = [];
      for (let i = 0; i < 7; i++) keys.push(toDateKey(now - i * 86400000));
      return keys;
    }
    case 'month': {
      const keys: string[] = [];
      for (let i = 0; i < 30; i++) keys.push(toDateKey(now - i * 86400000));
      return keys;
    }
    case 'all':
      return Object.keys(store.days);
    case 'chat':
      return [];
  }
}

function scopeProviders(store: Store, scope: Scope, chatKey: string | null, now = Date.now()): ProviderId[] {
  if (scope === 'chat') {
    const entry = chatKey ? store.chats[chatKey] : undefined;
    return entry ? [entry.provider] : [];
  }
  const out: ProviderId[] = [];
  for (const key of scopeDayKeys(store, scope, now)) {
    const day = store.days[key];
    if (!day) continue;
    for (const provider of Object.keys(day)) {
      const id = provider as ProviderId;
      if (day[id] && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

export function buildScopeView(store: Store, settings: Settings, scope: Scope, chatKey: string | null, now = Date.now()): ScopeView | null {
  if (scope === 'chat' && (!chatKey || !store.chats[chatKey])) return null;

  const counters = scopeCounters(store, scope, chatKey, now);
  const band = counters ? estimateBand(counters, buildScenarios(COEFFICIENTS, settings)) : { low: 0, mid: 0, high: 0 };

  const primary = { ...pickComparison(band.mid, settings.comparisonSet), label: formatComparison(band.mid, settings.comparisonSet) };
  const secondary = settings.comparisonSet === 'food' ? null : { ...pickComparison(band.mid, 'food'), label: formatComparison(band.mid, 'food') };

  return {
    counters,
    band,
    primary,
    secondary,
    provider: scopeProviders(store, scope, chatKey, now),
    estimatedRatio: counters ? estimatedRatio(counters) : 0,
    volumeLabel: formatVolume(band.mid, settings.units),
  };
}

/** Ephemeral chat-scope view built from a live DOM scan (no store writes). Returns null when the scan has no turns. */
export function buildScanView(scan: ConversationScan, settings: Settings): ScopeView | null {
  if (scan.turnCount === 0) return null;

  const counters: Counters = {
    turns: scan.turnCount,
    tokensOut: Math.round(scan.totalChars / 4),
    reasoningTurns: scan.reasoningCount,
    estimatedTurns: 0,
  };
  const band = estimateBand(counters, buildScenarios(COEFFICIENTS, settings));
  const primary = { ...pickComparison(band.mid, settings.comparisonSet), label: formatComparison(band.mid, settings.comparisonSet) };
  const secondary = settings.comparisonSet === 'food' ? null : { ...pickComparison(band.mid, 'food'), label: formatComparison(band.mid, 'food') };

  return {
    counters,
    band,
    primary,
    secondary,
    provider: [scan.provider],
    estimatedRatio: estimatedRatio(counters),
    volumeLabel: formatVolume(band.mid, settings.units),
  };
}
