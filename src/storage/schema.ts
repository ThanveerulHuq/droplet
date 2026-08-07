export type ProviderId = 'chatgpt';
export type AccountingMode = 'onsite' | 'total';
export type EnergyTier = 'efficient' | 'mid' | 'legacy';
export type WueSetting = 'best' | 'fleet' | 'industry';
export type Units = 'auto' | 'metric' | 'imperial';
export type ComparisonSet = 'everyday' | 'food' | 'household';

export interface Counters { turns: number; tokensOut: number; reasoningTurns: number; estimatedTurns: number; }
export interface ChatEntry { provider: ProviderId; firstSeen: number; lastSeen: number; counters: Counters; }
export interface Settings { accountingMode: AccountingMode; energyTier: EnergyTier; wue: WueSetting; units: Units; comparisonSet: ComparisonSet; tracking: boolean; }

export interface Store {
  meta: { schemaVersion: number; modelVersion: string; installedAt: number };
  settings: Settings;
  days: Record<string, Partial<Record<ProviderId, Counters>>>; // "2026-08-07" (local)
  chats: Record<string, ChatEntry>;                            // hashed conversation id
  seen: string[];                                              // capped dedupe ring
}

export const SEEN_CAP = 500;
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = { accountingMode: 'total', energyTier: 'mid', wue: 'fleet', units: 'auto', comparisonSet: 'everyday', tracking: true };

export function emptyCounters(): Counters { return { turns: 0, tokensOut: 0, reasoningTurns: 0, estimatedTurns: 0 }; }

export function addCounters(a: Counters, b: Counters): Counters {
  return { turns: a.turns + b.turns, tokensOut: a.tokensOut + b.tokensOut, reasoningTurns: a.reasoningTurns + b.reasoningTurns, estimatedTurns: a.estimatedTurns + b.estimatedTurns };
}

export function emptyStore(): Store {
  return { meta: { schemaVersion: SCHEMA_VERSION, modelVersion: '0.1.0', installedAt: Date.now() }, settings: { ...DEFAULT_SETTINGS }, days: {}, chats: {}, seen: [] };
}
