import type { Counters, ProviderId, Store } from './schema.ts';
import { SEEN_CAP, addCounters, emptyCounters } from './schema.ts';
import { MEDIAN_RESPONSE_TOKENS } from '../model/coefficients.ts';

export interface TurnSample {
  turnKey: string;
  charCount: number;      // -1 when the adapter could not read a length (R6.5)
  isReasoning: boolean;
  provider: ProviderId;
  chatKey?: string;       // hashed conversation id; undefined = no conversation (uncounted chat bucket, day still counts)
}

export interface IngestResult { store: Store; accepted: boolean; }

export function toDateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Pure state transition. Mutates `store` in place and returns it (single writer in the background). */
export function applyTurn(store: Store, sample: TurnSample, now = Date.now()): IngestResult {
  if (store.seen.includes(sample.turnKey)) return { store, accepted: false };

  const c: Counters = {
    turns: 1,
    tokensOut: sample.charCount >= 0 ? Math.round(sample.charCount / 4) : MEDIAN_RESPONSE_TOKENS,
    reasoningTurns: sample.isReasoning ? 1 : 0,
    estimatedTurns: sample.charCount < 0 ? 1 : 0,
  };

  const day = toDateKey(now);
  const dayCounters = store.days[day] ?? (store.days[day] = {});
  dayCounters[sample.provider] = addTo(dayCounters[sample.provider], c);

  if (sample.chatKey) {
    const entry = store.chats[sample.chatKey] ?? { provider: sample.provider, firstSeen: now, lastSeen: now, counters: emptyCounters() };
    entry.lastSeen = now;
    entry.counters = addTo(entry.counters, c);
    store.chats[sample.chatKey] = entry;
  }

  store.seen.push(sample.turnKey);
  if (store.seen.length > SEEN_CAP) store.seen.splice(0, store.seen.length - SEEN_CAP);
  return { store, accepted: true };
}

function addTo(base: Counters | undefined, c: Counters): Counters {
  return addCounters(base ?? emptyCounters(), c);
}
