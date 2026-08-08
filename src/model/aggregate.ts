import type { Counters, Store } from '../storage/schema.ts';
import { addCounters, emptyCounters } from '../storage/schema.ts';
import { toDateKey } from '../storage/ingest.ts';

export type Scope = 'chat' | 'today' | 'week' | 'month' | 'all';

/**
 * DST-safe day math: we only ever subtract fixed millisecond intervals from a
 * timestamp and re-derive the local calendar date via `toDateKey`. A 23h/25h
 * day still maps to the correct local calendar day. No manual day arithmetic.
 */
function sumDays(store: Store, keys: string[]): Counters {
  let total = emptyCounters();
  for (const key of keys) {
    const day = store.days[key];
    if (!day) continue;
    for (const provider of Object.values(day)) {
      if (provider) total = addCounters(total, provider);
    }
  }
  return total;
}

function lastLocalDays(count: number, now: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) keys.push(toDateKey(now - i * 86400000));
  return keys;
}

export function scopeCounters(store: Store, scope: Scope, chatKey: string | null, now = Date.now()): Counters | null {
  switch (scope) {
    case 'chat':
      return chatKey ? store.chats[chatKey]?.counters ?? null : null;
    case 'today':
      return sumDays(store, [toDateKey(now)]);
    case 'week':
      return sumDays(store, lastLocalDays(7, now));
    case 'month':
      return sumDays(store, lastLocalDays(30, now));
    case 'all':
      return sumDays(store, Object.keys(store.days));
  }
}

export function estimatedRatio(c: Counters): number {
  return c.turns > 0 ? c.estimatedTurns / c.turns : 0;
}
