# Droplet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a privacy-first browser extension (WXT + TypeScript, vanilla-TS popup) that counts AI chat turns locally and renders a defensible water estimate with a low/high band and physical comparison, per `Droplet-PRD.md`.

**Architecture:** Content script per supported host resolves a site adapter, observes *completed* assistant turns, and emits a `TurnSample` (hash of message id, char length, reasoning flag) to a background service worker. The worker dedupes against a capped ring and increments raw counters in `chrome.storage.local` day + conversation buckets. The popup aggregates counters and computes water at render time from a versioned, source-annotated coefficient set, always showing a low/high band plus an auto-selected comparison rung. Zero network calls anywhere.

**Tech Stack:** WXT (latest, mirrors chatwait-extension), TypeScript (strict), vanilla-TS popup (DOM rendering, no framework — same as the reference repo), `node:test` via `--experimental-strip-types` for pure-logic tests (zero extra test deps, same as the reference repo), pnpm. Targets: Chrome MV3 (`.output/chrome-mv3/`), Firefox MV2 (`.output/firefox-mv2/`).

---

## Reference repo (chatwait/chatwait-extension)

Droplet is a deliberately parallel project: same WXT build model, same "one adapter per host" philosophy, same always-on console diagnostics, same zero-extra-dep test strategy. These are the files to read first — the adapter DOM patterns are battle-tested against live chatgpt.com/claude.ai/gemini.google.com:

- `entrypoints/content/adapters/chatgpt.ts` — capture-phase listeners, MutationObserver re-attach on body changes, `data-message-id` stable per-message dedupe, `data-send-label`/`data-stop-label` completion detection.
- `entrypoints/content/adapters/claude.ts` — history-load "settling" window, trailing-message diffing, submit corroboration timing.
- `entrypoints/content/adapters/gemini.ts` — transient→permanent turn swap re-anchoring.
- `lib/log.ts` — always-on `[Prefix] HH:mm:ss.SSS` console logging (no dev-flag gate).
- `lib/storage.ts` — flat `get`/`set`/`remove` wrappers over `browser.storage.local` with a `KEYS` const.
- `lib/ad-selection.ts` + `scripts/ad-selection.test.mjs` — pure-function + `node --test` pattern.
- `wxt.config.ts` — `version_name` build identifier, per-browser zip names, AMO `data_collection_permissions`, `WXT_MOCK=1`-gated dev entrypoints stripped from production builds.
- `entrypoints/background.ts` — serialized async queues (`adSelectionQueue`) to prevent read-modify-write races between tabs; listener registration before any `await`.

**License note:** the reference repo is PolyForm Strict (read, don't copy verbatim). Use its *techniques* and selector knowledge, not its code wholesale; write Droplet's own implementation. Droplet itself is MIT.

---

## Key decisions (PRD ambiguities resolved)

1. **Popup framework:** PRD §9.1 says React. Decision: **vanilla TS** popup (DOM rendering), matching the reference repo's `entrypoints/popup/main.ts` + `index.html` + `style.css` shape. No framework, no extra deps. Popup logic lives in pure `src/ui/*.ts` modules (render functions over the model) so it stays testable and thin.
2. **Repo layout:** PRD §9.5 is authoritative (`entrypoints/background.ts`, `entrypoints/chatgpt.content.ts`, `entrypoints/popup/`, `src/{adapters,model,storage,ui}/`). The reference's `entrypoints/content/adapters/` arrangement is not used.
3. **Popup scopes:** PRD G1 lists five scopes, §5.1 shows four tabs. Ship the four tabs per the mockup (`chat`/`today`/`week`/`month`). The engine's scope type includes `'all'` because aggregation is free; add the tab in a later release.
4. **Dedupe ring:** PRD §9.6 schema has a single `seen: string[]`. Keep that (global ring capped at 500), which satisfies R9.2/R9.7 for practical sessions; per-conversation rings are a documented future improvement.
5. **Reasoning multiplier on aggregates:** we store `reasoningTurns` count only (per PRD §8.2), so the multiplier is applied as a blended share `mult = 1 + (reasoningTurns/turns) × (multiplier − 1)`. This exact formula is disclosed in the methodology panel.
6. **Estimated turns:** `TurnSample.charCount` is sent as `-1` when the adapter cannot read a length (PRD R6.5). Background increments `estimatedTurns` and adds `medianResponseTokens` to `tokensOut`.
7. **Energy tier / WUE settings → coefficients:** each setting picks the coefficient *column* used for the headline estimate (`efficient`→low, `mid`→mid, `legacy`→high for energy; `best`→low, `fleet`→mid, `industry`→high for WUE). The band is always the model at all-low vs all-high, independent of settings (satisfies R5.1.2/R6.2).
8. **Turn hashing:** no sync SHA-256 exists in web APIs, so the adapter starts `crypto.subtle.digest` when the assistant message node first appears and awaits it at completion (completion is always ≫1s later, so the await is free). `turnKey` = first 16 hex chars.
9. **Conversation hashing:** `getConversationId` returns the raw stable id from the URL; the content script hashes it with the same util before use.
10. **Secondary comparison:** primary rung uses `settings.comparisonSet`; secondary line uses the Food set as an extra relatable anchor (skipped if sets match).

---

## Test & verification strategy

- **Pure logic** (model, comparisons, ingest, migrations, aggregation, formatting, hash, registry): `node --experimental-strip-types --test scripts/*.test.mjs`, importing `.ts` modules with an explicit `.ts` extension (reference pattern). Node 22.x recommended (built/tested with the reference on v22.19.0). `tsc` ignores `.mjs` because `allowJs` is off.
- **Pure modules must use `import type`** for type-only imports so `--experimental-strip-types` runs them under node.
- **DOM/adapters:** not unit-tested with jsdom. Verified two ways: (a) a `WXT_MOCK=1`-gated mock harness (tiny node server + a mock content script that runs the *real* adapter against a local HTML replica of the chat DOM), mirroring the reference's `mock.content.ts` pattern; (b) manual tally checklists on live sites (PRD M1 exit criteria).
- **Popup:** thin vanilla-TS DOM layer over the pure `src/ui` view modules + the reference's always-on logging for field debugging. No component test framework in v1 (YAGNI; keep the no-deps privacy story clean).
- **Privacy gate:** `pnpm assert-no-network` scans bundled output for `fetch(`, `new XMLHttpRequest(`, `sendBeacon(`, `new WebSocket(`. Enforced in CI.

---

## Repository layout (final state)

```
droplet-extension/
├── README.md
├── PRIVACY.md
├── METHODOLOGY.md
├── LICENSE
├── AGENTS.md
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── wxt.config.ts
├── entrypoints/
│   ├── background.ts
│   ├── chatgpt.content.ts
│   ├── mock.content.ts                # WXT_MOCK=1 only, stripped from builds
│   └── popup/
│       ├── index.html
│       └── main.ts
├── src/
│   ├── adapters/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── chatgpt.ts
│   │   ├── claude.ts                  # M6
│   │   ├── gemini.ts                  # M6
│   │   └── grok.ts                    # M6
│   ├── model/
│   │   ├── coefficients.ts
│   │   ├── estimate.ts
│   │   └── comparisons.ts
│   ├── storage/
│   │   ├── schema.ts
│   │   ├── ingest.ts
│   │   ├── repo.ts
│   │   └── migrations.ts
│   ├── ui/
│   │   ├── app.ts
│   │   ├── scopes.ts
│   │   ├── methodology.ts
│   │   ├── settings.ts
│   │   └── share-card.ts
│   └── lib/
│       ├── hash.ts
│       ├── units.ts
│       └── log.ts
├── scripts/
│   ├── mock-server.mjs                # dev-only
│   ├── assert-no-network.ts
│   └── *.test.mjs
├── public/icons/                      # 16/32/48/96/128 png
└── .github/workflows/ci.yml
```

---

# Milestone M0 — WXT skeleton, MV3 manifest, popup shell, storage layer

**Exit criteria:** loads unpacked, popup opens, storage round-trips.

### Task 1: Scaffold the repo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`, `LICENSE`, `AGENTS.md`
- Run: `git init`

**Step 1:** Initialize the git repo and write the scaffold files.

```jsonc
// package.json
{
  "name": "droplet",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "postinstall": "wxt prepare",
    "test": "node --experimental-strip-types --test scripts/*.test.mjs",
    "typecheck": "tsc --noEmit",
    "assert-no-network": "node --experimental-strip-types scripts/assert-no-network.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.4.0",
    "wxt": "latest"
  }
}
```

```yaml
# pnpm-workspace.yaml
allowBuilds:
  esbuild: true
  spawn-sync: true
```

`tsconfig.json` mirrors the reference exactly (target ESNext, module ESNext, moduleResolution Bundler, strict, noEmit, the `@/*`/`~/*` path aliases, include `**/*` + `.wxt/wxt.d.ts`, exclude `.output`).

`.gitignore`: `node_modules/`, `.output/`, `.wxt/`, `.chrome/`, `.DS_Store`.

`LICENSE`: MIT.

`AGENTS.md`: short note — this repo is MIT; content scripts must never read or store prompt/response text; keep `src/lib/log.ts` always-on; pure functions only in `src/model` and `src/storage/ingest.ts` so node tests can import them.

**Step 2: Verify scaffold**

```bash
pnpm install
pnpm typecheck
```
Expected: both pass (empty tree).

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold WXT + TS project"
```

### Task 2: Manifest + icons + minimal build

**Files:**
- Create: `wxt.config.ts`, `public/icons/{16,32,48,96,128}.png`

**Step 1:** Write `wxt.config.ts`. Copy the reference's `buildIdentifier()` and per-browser zip-naming helpers verbatim (they're generic), then:

```ts
import { defineConfig } from 'wxt';
// ... buildIdentifier(), targetBrowser() helpers from reference wxt.config.ts ...

export default defineConfig({
  zip: {
    name: targetBrowser === 'chrome' ? 'droplet-extension' : `droplet-extension-${targetBrowser}`,
    artifactTemplate: '{{name}}.zip',
  },
  hooks: {
    'entrypoints:found'(_wxt, infos) {
      // mock.content.ts runs the real adapters against a local replica page (see M1).
      // Never ships. Mirrors the reference's WXT_MOCK gate.
      if (process.env.WXT_MOCK !== '1') {
        const i = infos.findIndex((info) => info.name === 'mock');
        if (i !== -1) infos.splice(i, 1);
      }
    },
  },
  manifest: {
    name: 'Droplet: water used by your AI chats',
    description: 'Estimate the water used by your AI chat usage. No data collected, no network calls.',
    version_name: buildIdentifier(),
    permissions: ['storage'],
    host_permissions: ['https://chatgpt.com/*'],
    action: { default_popup: 'popup.html', default_icon: { '16': 'icons/16.png', '32': 'icons/32.png', '48': 'icons/48.png', '128': 'icons/128.png' } },
    ...(targetBrowser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'droplet@droplet.app', data_collection_permissions: { required: [], optional: [] } } } }
      : {}),
  },
});
```

**Step 2:** Generate placeholder icon PNGs (any tool; e.g. a one-off script or ImageMagick) — simple droplet-shaped solid color on white, 16/32/48/96/128. Commit them.

**Step 3: Verify**

```bash
pnpm build
ls .output/chrome-mv3/manifest.json
```
Expected: manifest contains exactly `storage` + `https://chatgpt.com/*` permission, popup path set, no `web_accessible_resources`. Load unpacked in `chrome://extensions`; the action icon appears.

**Step 4: Commit** — `feat: manifest, icons, chrome-mv3 build`.

### Task 3: Storage schema (pure, TDD)

**Files:**
- Create: `src/storage/schema.ts`
- Test: `scripts/schema.test.mjs`

**Step 1: Write the failing test**

```js
// scripts/schema.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addCounters, emptyCounters, DEFAULT_SETTINGS, SEEN_CAP } from '../src/storage/schema.ts';

test('emptyCounters is all zeroes', () => {
  assert.deepEqual(emptyCounters(), { turns: 0, tokensOut: 0, reasoningTurns: 0, estimatedTurns: 0 });
});
test('addCounters sums each field', () => {
  const a = { turns: 1, tokensOut: 75, reasoningTurns: 1, estimatedTurns: 0 };
  const b = { turns: 2, tokensOut: 150, reasoningTurns: 0, estimatedTurns: 1 };
  assert.deepEqual(addCounters(a, b), { turns: 3, tokensOut: 225, reasoningTurns: 1, estimatedTurns: 1 });
});
test('defaults match PRD §5.3', () => {
  assert.equal(DEFAULT_SETTINGS.accountingMode, 'total');
  assert.equal(DEFAULT_SETTINGS.energyTier, 'mid');
  assert.equal(DEFAULT_SETTINGS.wue, 'fleet');
  assert.equal(DEFAULT_SETTINGS.units, 'auto');
  assert.equal(DEFAULT_SETTINGS.comparisonSet, 'everyday');
  assert.equal(DEFAULT_SETTINGS.tracking, true);
});
test('SEEN_CAP is 500', () => { assert.equal(SEEN_CAP, 500); });
```

**Step 2:** Run `pnpm test` → FAIL (`Cannot find module`).

**Step 3: Implement `src/storage/schema.ts`** (per PRD §9.6, §5.3):

```ts
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
```

**Step 4:** Run `pnpm test` → PASS.

**Step 5: Commit** — `feat: storage schema with defaults`.

### Task 4: Turn ingest — pure, deduped counter increments (TDD)

**Files:**
- Create: `src/storage/ingest.ts`
- Test: `scripts/ingest.test.mjs`

**Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore } from '../src/storage/schema.ts';
import { applyTurn } from '../src/storage/ingest.ts';

const sample = (over = {}) => ({ turnKey: 'k1', charCount: 1200, isReasoning: false, provider: 'chatgpt', ...over });

test('increments the day bucket and returns accepted', () => {
  const store = emptyStore();
  const r = applyTurn(store, sample(), new Date('2026-08-07T12:00:00').getTime());
  assert.equal(r.accepted, true);
  assert.equal(store.days['2026-08-07'].chatgpt.turns, 1);
  assert.equal(store.days['2026-08-07'].chatgpt.tokensOut, 300); // 1200/4
  assert.equal(r.store, store);
});
test('dedupes identical turnKeys', () => {
  const store = emptyStore();
  applyTurn(store, sample(), new Date('2026-08-07T12:00:00').getTime());
  const r = applyTurn(store, sample(), new Date('2026-08-07T12:00:01').getTime());
  assert.equal(r.accepted, false);
  assert.equal(store.days['2026-08-07'].chatgpt.turns, 1);
});
test('charCount -1 is marked estimated and uses median tokens', () => {
  const store = emptyStore();
  applyTurn(store, sample({ turnKey: 'k2', charCount: -1 }), new Date('2026-08-07T12:00:00').getTime());
  const c = store.days['2026-08-07'].chatgpt;
  assert.equal(c.estimatedTurns, 1);
  assert.equal(c.tokensOut, 75); // MEDIAN_RESPONSE_TOKENS
});
test('reasoning turns increment reasoningTurns', () => {
  const store = emptyStore();
  applyTurn(store, sample({ turnKey: 'k3', isReasoning: true }), new Date('2026-08-07T12:00:00').getTime());
  assert.equal(store.days['2026-08-07'].chatgpt.reasoningTurns, 1);
});
test('updates the conversation bucket and lastSeen', () => {
  const store = emptyStore();
  store.chats['abc'] = { provider: 'chatgpt', firstSeen: 1, lastSeen: 1, counters: { turns: 0, tokensOut: 0, reasoningTurns: 0, estimatedTurns: 0 } };
  applyTurn(store, sample({ chatKey: 'abc' }), 5000);
  assert.equal(store.chats['abc'].counters.turns, 1);
  assert.equal(store.chats['abc'].lastSeen, 5000);
});
test('seen ring is capped at SEEN_CAP', () => {
  const store = emptyStore();
  for (let i = 0; i < 501; i++) applyTurn(store, sample({ turnKey: `k${i}`, chatKey: 'x' }), 1000 + i);
  assert.equal(store.seen.length, 500);
});
test('a turn that was evicted from the ring is counted again', () => {
  const store = emptyStore();
  for (let i = 0; i < 501; i++) applyTurn(store, sample({ turnKey: `k${i}`, chatKey: 'x' }), 1000 + i);
  const r = applyTurn(store, sample({ turnKey: 'k0' }), 2000); // evicted earlier
  assert.equal(r.accepted, true);
});
```

**Step 2:** Run `pnpm test` → FAIL.

**Step 3: Implement `src/storage/ingest.ts`**

```ts
import type { Counters, ProviderId, Store } from './schema';
import { SEEN_CAP, emptyCounters } from './schema';
import { MEDIAN_RESPONSE_TOKENS } from '../model/coefficients';

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
  store.days[day] ??= {};
  store.days[day][sample.provider] = addTo(store.days[day][sample.provider], c);

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
  const b = base ?? emptyCounters();
  return { turns: b.turns + c.turns, tokensOut: b.tokensOut + c.tokensOut, reasoningTurns: b.reasoningTurns + c.reasoningTurns, estimatedTurns: b.estimatedTurns + c.estimatedTurns };
}
```

**Step 4:** Run `pnpm test` → PASS.

**Step 5: Commit** — `feat: deduplicated turn ingest into day + conversation buckets`.

### Task 5: Storage repo wrapper + migrations + background init

**Files:**
- Create: `src/storage/repo.ts`, `src/storage/migrations.ts`, `entrypoints/background.ts`

**Step 1:** `src/storage/repo.ts` — single-key storage wrapper:

```ts
import { emptyStore, type Store } from './schema';
import { migrate } from './migrations';

const KEY = 'droplet_store';

export const repo = {
  async load(): Promise<Store> {
    const raw = (await browser.storage.local.get(KEY))[KEY];
    return migrate(raw ? (raw as unknown as Store) : emptyStore());
  },
  async save(store: Store): Promise<void> { await browser.storage.local.set({ [KEY]: store }); },
};
```

**Step 2:** `src/storage/migrations.ts` — versioned migrations (PRD §9.2 #4). v1: identity.

```ts
import type { Store } from './schema';
import { SCHEMA_VERSION, emptyStore } from './schema';

export function migrate(store: Store): Store {
  let s = store;
  while (s.meta.schemaVersion < SCHEMA_VERSION) {
    s = migrations[s.meta.schemaVersion]?.(s) ?? s; // switch on (store) => Store per version bump
  }
  return s;
}
const migrations: Record<number, (s: Store) => Store> = {}; // filled as schema evolves
```

Add `scripts/migrations.test.mjs`: `migrate(emptyStore())` is a no-op and returns a store with `schemaVersion === SCHEMA_VERSION`.

**Step 3:** `entrypoints/background.ts` — serialize ingest to avoid read-modify-write races (reference's `adSelectionQueue` pattern):

```ts
import { repo } from '../src/storage/repo';
import { applyTurn } from '../src/storage/ingest';
import { log } from '../src/lib/log';

let queue: Promise<void> = Promise.resolve();

export default defineBackground(() => {
  log.info('build', browser.runtime.getManifest().version_name);
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'TURN_SAMPLE') {
      // Serialized across tabs: two concurrent reads of the same store must never both
      // increment from the same snapshot (R9.7). Mirrors the reference's enqueueAdSelection.
      queue = queue
        .then(() => repo.load())
        .then(async (store) => {
          const { store: next, accepted } = applyTurn(store, message.sample);
          if (accepted) await repo.save(next);
          return accepted;
        })
        .then((accepted) => sendResponse({ accepted }))
        .catch((err) => { log.warn('TURN_SAMPLE failed', err); sendResponse({ accepted: false }); });
      return true;
    }
  });
  void repo.load().then((store) => log.info('store loaded', store.meta));
});
```

**Step 4: Verify** — `pnpm build`, load unpacked, open the service worker console; expect `store loaded { schemaVersion: 1, ... }`.

**Step 5: Commit** — `feat: storage repo, migrations, background ingest queue`.

### Task 6: Popup shell (vanilla TS)

**Files:**
- Create: `entrypoints/popup/index.html`, `entrypoints/popup/main.ts`, `src/ui/app.ts`, `src/ui/style.css`

**Step 1:** `entrypoints/popup/index.html` — WXT popup root: static `<div id="app">` shell (header, version footer) and `<script type="module" src="./main.ts">`. Width via CSS `body { width: 340px }`. Mirrors the reference's `entrypoints/popup/index.html` + `main.ts` + `style.css` trio.

**Step 2:** `main.ts` imports `renderApp` from `src/ui/app.ts`. `src/ui/app.ts` wires the static shell: shows `browser.runtime.getManifest().version_name` in the footer, and a "storage round-trip" self-check button that calls `repo.load()` and prints `meta.installedAt` into a status line (dev affordance, removed in M2).

**Step 3: Verify** — `pnpm dev` (or build + load unpacked); click the action icon → popup opens, shows version, storage load works.

**Step 4: Commit** — `feat: popup shell with storage round-trip`.

---

# Milestone M1 — ChatGPT adapter: observe, complete-detection, dedupe, SPA nav

**Exit criteria:** counts match a manual tally across a 50-turn session, including reload and scrollback.

> Read `chatwait-extension/entrypoints/content/adapters/chatgpt.ts` first. Droplet reuses its *detection strategies* but implements its own counting contract. All selectors below are starting points verified live on 2026-06-12 by the reference; **re-verify each against the live DOM as part of Task 10** and record the verified date in a comment (the reference keeps this discipline — copy it).

### Task 7: Hash util (TDD)

**Files:**
- Create: `src/lib/hash.ts`
- Test: `scripts/hash.test.mjs`

```ts
// SHA-256 of `input`, first `len` hex chars (default 16). PRD §8.2 turnKey / §9.3 convo id.
export async function sha256Hex(input: string, len = 16): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, len);
}
```

Tests: `sha256Hex('abc')` is deterministic and 16 chars; different inputs differ; `len=64` returns 64 chars.

### Task 8: Adapter contract + registry (TDD)

**Files:**
- Create: `src/adapters/types.ts`, `src/adapters/registry.ts`
- Test: `scripts/registry.test.mjs`

`types.ts` per PRD §9.3 exactly:

```ts
export type ProviderId = 'chatgpt';

export interface TurnSample {
  turnKey: string;
  charCount: number;   // -1 when unknown
  isReasoning: boolean;
  provider: ProviderId;
}

export interface SelectorSet {
  sendButton: string[];
  composer: string[];
  userMessage: string[];
  assistantMessage: string[];
  stopControl: string[];   // e.g. send button while generating
  reasoning: string[];     // reasoning UI container, matched structurally
}

export interface SiteAdapter {
  id: ProviderId;
  matches(url: URL): boolean;
  getConversationId(url: URL): string | null;
  observe(onTurn: (sample: TurnSample) => void, opts: { getConversationId: () => string | null }): () => void;
  selectors: SelectorSet;
  adapterVersion: string;
}
```

Note: `getConversationId` returns the **raw** stable id; the caller hashes it. `observe` returns a teardown function. The adapter is synchronous but may start async hashing internally (decision #8).

`registry.ts`:

```ts
import type { ProviderId, SiteAdapter } from './types';
export function resolveAdapter(url: URL): SiteAdapter | null { /* try each registered adapter; first matches() wins */ }
export function registerAdapter(adapter: SiteAdapter): void;
```

Tests: registry returns the chatgpt adapter for `https://chatgpt.com/c/<uuid>`, null for `https://example.com/`.

### Task 9: Chatgpt adapter — conversation id + observation skeleton

**Files:**
- Create: `src/adapters/chatgpt.ts`
- Test: `scripts/chatgpt-id.test.mjs` (pure URL/id extraction only)

`getConversationId`: accept `https://chatgpt.com/c/<uuid>` and `https://chatgpt.com/g/<slug>/c/<uuid>`; return the trailing UUID, else null. `matches`: `url.hostname === 'chatgpt.com' && /^\/g\/[^/]+\/c\//.test(pathname) || /^\/c\//.test(pathname)`.

`observe` skeleton: a `MutationObserver` on `document.body` with `{ childList: true, subtree: true }` that:
1. On **submit** (capture-phase click on `[data-testid="send-button"], button[data-composer-submit]` and Enter on `#prompt-textarea, [data-mobile-composer-prompt]`) — snapshot the trailing assistant-message identity and start watching for a new assistant message.
2. Watches until a **new** assistant message element appears (compare trailing `[data-message-author-role="assistant"]` identity, not count — virtualized lists recycle nodes, reference chatgpt.ts).
3. Kicks off `sha256Hex(messageId)` immediately when the new element appears (decision #8).
4. Returns a teardown function disconnecting all observers and listeners.

Keep the adapter DOM-free of any provider logic beyond these primitives; count computation lives here but all storage lives in the background.

### Task 10: Chatgpt adapter — completion detection + TurnSample emission

The core hard problem (PRD R9.1). Completion is detected by **stop-control disappearance + 1200 ms mutation-quiet debounce**:

1. When a new assistant message appears, arm a `MutationObserver` filtered on the stop control (the send button becomes a "Stop generating" control during generation). Completion = stop control reverts to the enabled send state **and** the assistant element is unchanged for 1200 ms.
2. Re-baseline on every mutation that changes the trailing assistant element while the stop control is still active (still streaming); never count mid-stream (R9.1).
3. On completion: `charCount = el.textContent.length` (only the length survives — nothing else is read or retained), `isReasoning = !!el.querySelector(reasoningSelector)` (structural only), `turnKey = await sha256Hex(messageId)` where `messageId = el.getAttribute('data-message-id')` (fall back to an ancestor `[id]`, then to `sha256Hex(el.textContent)` if truly absent), `provider: 'chatgpt'`. Emit `TurnSample`.
4. If `textContent` is empty/`-1`: send `charCount: -1` (R6.5).
5. **Degraded state (R9.4):** ordered selector fallback chain — if the assistant selector never matches within a session, or completion never establishes, call `opts.onDegraded?.()` once; the content script flips a `degraded` flag the popup surfaces.

**Verification step (mandatory, recorded):** load `https://chatgpt.com`, run `pnpm dev`, and in the page's DevTools console confirm each selector in `chatgpt.ts` matches exactly the intended nodes. Note `data-send-label`/`data-stop-label` presence (classic vs wm-app variants) and record which apply. Update the selector comment with the verification date.

### Task 11: Content script entrypoint

**Files:**
- Create: `entrypoints/chatgpt.content.ts`

```ts
import { resolveAdapter } from '../src/adapters/registry';
import { sha256Hex } from '../src/lib/hash';
import { log } from '../src/lib/log';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  async main() {
    // wait for DOMContentLoaded (reference pattern)
    const adapter = resolveAdapter(new URL(location.href));
    if (!adapter) return;
    log.info(`adapter ${adapter.id} v${adapter.adapterVersion} attached`);

    let currentChatKey: string | null = null;
    async function refreshChatKey() {
      const id = adapter.getConversationId(new URL(location.href));
      currentChatKey = id ? await sha256Hex(id) : null;
      log.info(`conversation key: ${currentChatKey ?? 'none'}`);
    }
    await refreshChatKey();
    // SPA nav: patch history.pushState + popstate (Task 13) -> refreshChatKey + re-baseline

    const teardown = adapter.observe(
      (sample) => {
        void browser.runtime.sendMessage({ type: 'TURN_SAMPLE', sample: { ...sample, chatKey: currentChatKey } });
      },
      { getConversationId: () => currentChatKey },
    );

    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'GET_CONVERSATION_KEY') return { chatKey: currentChatKey };
    });
  },
});
```

### Task 12: Background — receive + dedupe + increment across tabs

Already scaffolded in Task 5. This task closes the loop: verify with a manual two-tab test (R9.7). Open the same conversation in two tabs, generate in each, confirm `days` increments exactly once per turn and `chats` once per turn. Add `scripts/ingest-race.test.mjs` simulating interleaved `applyTurn` calls on a shared store snapshot to lock the serialized-writer contract.

### Task 13: SPA navigation re-resolve (R9.3)

**Files:**
- Modify: `entrypoints/chatgpt.content.ts`

Patch `history.pushState`/`replaceState` (wrap with a capture-phase `before` hook) and listen to `popstate`. On change: re-run `refreshChatKey()`. The adapter's body MutationObserver re-attaches itself on DOM rebuilds (reference `reattachObserver` pattern in Task 9's `observe`), so only the key re-resolution is needed here. Verify by starting a chat, navigating to a second chat without reload, confirming `GET_CONVERSATION_KEY` returns the new hash.

### Task 14: Mock harness (dev-only, WXT_MOCK-gated)

**Files:**
- Create: `scripts/mock-server.mjs` (static file server on `http://localhost:5199`), `entrypoints/mock.content.ts`, `public/mock/chatgpt.html`

`chatgpt.html` is a static replica of the classic ChatGPT DOM: composer, send button (toggles to a "Stop generating" control while a scripted timer streams tokens), user + assistant messages carrying `data-message-id`, a reasoning container on one message. A page script lets the tester "submit" turns with configurable lengths.

`mock.content.ts` mirrors the reference's mock entrypoint: run the *real* `chatgpt` adapter against the replica page, send real `TURN_SAMPLE` messages to the real background (they land in real `chrome.storage.local`), and expose a `window.__dropletMock` API to programmatically drive turns and read back counts. Gated in `wxt.config.ts` (Task 2). Add `scripts/mock-count.test.mjs` if feasible: drive N scripted turns, assert `days` totals match — this is the automated half of the M1 exit criteria.

**Verify:** `WXT_MOCK=1 pnpm dev` → open `http://localhost:5199` in a Chrome for Testing profile with the extension loaded; counts match scripted turns.

### Task 15: Live 50-turn tally (M1 exit criteria)

Manual checklist, documented in `README.md` under "Testing the adapter" until M5 formalizes QA:
1. Fresh chat: 50 turns, alternating short/long prompts → popup "This chat" count matches the manual tally exactly.
2. Reload the page mid-conversation → count is unchanged (no double counting on history load; history must re-baseline, never count).
3. Scroll back into virtualized history → count unchanged (dedupe ring).
4. Regenerate a response → count increments (new message id, R9.5).
5. A reasoning model turn → `reasoningTurns` increments and the popup band widens.
6. Degraded: block `[data-message-author-role="assistant"]` via a dev override → popup shows "Tracking paused — adapter needs updating".

Run against live chatgpt.com. Record the DOM variant tested (classic signed-in) and date. **This task is only done when the tally passes.**

---

# Milestone M2 — Estimation engine + comparison ladder + popup scopes

**Exit criteria:** four scopes render correct figures and bands.

### Task 16: Coefficients (TDD)

**Files:**
- Create: `src/model/coefficients.ts`
- Test: `scripts/coefficients.test.mjs`

Per PRD §6.2 with every coefficient versioned and source-annotated:

```ts
export interface CoeffSet { low: number; mid: number; high: number; }
export interface CoefficientVersion {
  modelVersion: string;
  whBase: CoeffSet;
  whPerToken: CoeffSet;
  reasoningMultiplier: CoeffSet;
  wueDc: CoeffSet;      // mL/Wh
  ewifGrid: CoeffSet;   // mL/Wh
  medianResponseTokens: number;
}
export const COEFFICIENTS: CoefficientVersion = {
  modelVersion: '0.1.0',
  whBase:         { low: 0.02,  mid: 0.05,  high: 0.30 },
  whPerToken:     { low: 0.0002, mid: 0.00063, high: 0.009 },
  reasoningMultiplier: { low: 1.5, mid: 3, high: 10 },
  wueDc:          { low: 0.2,   mid: 1.1,   high: 1.9 },
  ewifGrid:       { low: 1.0,   mid: 4.5,   high: 6.5 },
  medianResponseTokens: 75,
};
// Every set carries a source: export const COEFFICIENT_SOURCES = { whBase: [{label,url}], ... }
```

Calibration test (PRD §6.2): a 300-token response at Mid ≈ Google's 0.24 Wh → `0.05 + 300 × 0.00063 ≈ 0.24`. Source URLs are added to `METHODOLOGY.md` (M3) and rendered in the methodology panel.

### Task 17: Estimation engine (TDD)

**Files:**
- Create: `src/model/estimate.ts`
- Test: `scripts/estimate.test.mjs`

```ts
import type { CoeffSet } from './coefficients';
import type { Counters } from '../storage/schema';

export interface ScenarioCoeffs { whBase: number; whPerToken: number; reasoningMultiplier: number; wueDc: number; ewifGrid: number; accounting: 'onsite' | 'total'; }
export interface ScenarioSet { low: ScenarioCoeffs; mid: ScenarioCoeffs; high: ScenarioCoeffs; }
export interface Band { low: number; mid: number; high: number; }

export function energyWh(counters: Counters, c: ScenarioCoeffs): number {
  const share = counters.turns > 0 ? counters.reasoningTurns / counters.turns : 0;
  const mult = 1 + share * (c.reasoningMultiplier - 1); // decision #5, disclosed in methodology
  return (counters.turns * c.whBase + counters.tokensOut * c.whPerToken) * mult;
}
export function waterMl(energyWh: number, c: ScenarioCoeffs): number {
  const onsite = energyWh * c.wueDc;
  return c.accounting === 'onsite' ? onsite : onsite + energyWh * c.ewifGrid;
}
export function estimateBand(counters: Counters, scenarios: ScenarioSet): Band {
  const f = (s: ScenarioCoeffs) => waterMl(energyWh(counters, s), s);
  return { low: f(scenarios.low), mid: f(scenarios.mid), high: f(scenarios.high) };
}
```

**Files:** `src/model/scenarios.ts` builds `ScenarioSet` from `COEFFICIENTS` + `Settings` (decision #7):

```ts
export function buildScenarios(c: CoefficientVersion, settings: Settings): ScenarioSet
// energy column: {efficient:'low', mid:'mid', legacy:'high'}[settings.energyTier]
// wue column:    {best:'low', fleet:'mid', industry:'high'}[settings.wue]
// accounting:    settings.accountingMode
// low/high scenarios always use all-low/all-high columns (band independent of settings)
```

Tests: band ordering `low <= mid <= high`; zero counters → all zero; a single mid estimate on a 42-turn/300-token-each chat equals a hand-computed value; accounting 'onsite' < 'total'.

### Task 18: Comparison ladder (TDD)

**Files:**
- Create: `src/model/comparisons.ts`
- Test: `scripts/comparisons.test.mjs`

Ladder per PRD §7 as one data file, each rung carrying `source` (R7.1):

```ts
export type ComparisonSet = 'everyday' | 'food' | 'household';
export interface ComparisonRung { valueMl: number; name: string; set: ComparisonSet | 'all'; source: string; }
export const LADDER: ComparisonRung[] = [
  { valueMl: 0.5,   name: 'drop',           set: 'all',        source: '...' },
  { valueMl: 5,     name: 'teaspoon',       set: 'all',        source: '...' },
  { valueMl: 15,    name: 'tablespoon',     set: 'all',        source: '...' },
  { valueMl: 250,   name: 'cup',            set: 'all',        source: '...' },
  { valueMl: 500,   name: 'water bottle',   set: 'all',        source: '...' },
  { valueMl: 4000,  name: 'almond',         set: 'food',       source: 'lifecycle, see METHODOLOGY.md' },
  { valueMl: 6000,  name: 'toilet flush',   set: 'household',  source: '...' },
  { valueMl: 50000, name: '8-minute shower',set: 'household',  source: '...' },
  { valueMl: 100000,name: 'washing-machine load', set: 'household', source: '...' },
  { valueMl: 140000,name: 'cup of coffee',  set: 'food',       source: 'lifecycle, see METHODOLOGY.md' },
  { valueMl: 2400000,name: 'hamburger',     set: 'food',       source: 'lifecycle, see METHODOLOGY.md' },
  { valueMl: 7600000,name: 'pair of jeans', set: 'household',  source: 'lifecycle, see METHODOLOGY.md' },
];

export function pickComparison(estimateMl: number, set: ComparisonSet): { rung: ComparisonRung; multiple: number } {
  const rungs = LADDER.filter((r) => r.set === 'all' || r.set === set).sort((a, b) => a.valueMl - b.valueMl);
  const below = rungs.filter((r) => r.valueMl <= estimateMl);
  const rung = below.length ? below[below.length - 1] : rungs[0];
  return { rung, multiple: estimateMl / rung.valueMl };
}

export function formatComparison(estimateMl: number, set: ComparisonSet): string {
  // "≈1.4 tsp"-style: pick rung closest below, express as multiple.
  // <1 → "less than one <rung>"; ≥10 → integer; else 1 decimal. "1.7 almonds", "4 water bottles", "one teaspoon".
}
```

Tests (R7 / R6.2 semantics): 6.8 mL everyday → teaspoon, multiple 1.36, string `≈1.4 teaspoons`; 1.7 L everyday → water bottle multiple 3.4; 0.1 mL → "less than one drop" (never "0.003 showers"); 0.4 mL food → "less than one drop"; each rung carries a source; food set excludes shower/jeans.

### Task 19: Aggregation engine (TDD)

**Files:**
- Create: `src/model/aggregate.ts`
- Test: `scripts/aggregate.test.mjs`

```ts
export type Scope = 'chat' | 'today' | 'week' | 'month' | 'all';
export function scopeCounters(store: Store, scope: Scope, chatKey: string | null, now = Date.now()): Counters | null
// 'chat': chats[chatKey]?.counters (null -> empty state)
// 'today': days[toDateKey(now)]
// 'week': sum days for the last 7 local days ending today
// 'month': sum days for the last 30 local days ending today
// 'all': sum all days
export function estimatedRatio(c: Counters): number  // estimatedTurns / turns
```

`addCounters` from schema is the reducer. Tests: week sums exactly 7 local day buckets (DST-safe via local date math); empty store → today returns zeroed counters (not null — popup shows "Nothing tracked yet today"); >10% estimated ratio detection helper.

### Task 20: Unit formatting (TDD)

**Files:**
- Create: `src/lib/units.ts`
- Test: `scripts/units.test.mjs`

`formatVolume(mL, settings.units)` → metric: mL <1000 ? `6.8 mL` : `1.4 L`; imperial: fl oz/gal. Locale-derived default: `Intl.NumberFormat`? No — `navigator.language` region heuristic: use `'en-US' | 'en-GB' | ...` → imperial vs metric, or a small map. `units: 'auto'` resolves once from `navigator.language` in the popup and is cached in settings.

Tests: 6.8 mL metric → `6.8 mL`; 1.4 L metric → `1.4 L`; imperial equivalents; unknown locale → metric.

### Task 21: Popup data layer (TDD)

**Files:**
- Create: `src/model/popup.ts`
- Test: `scripts/popup.test.mjs`

A pure mapper: `buildScopeView(store, settings, scope, chatKey, now)` → `{ counters, band, primary: Comparison, secondary: Comparison | null, provider: ProviderId[], estimatedRatio, volumeLabel }`. Secondary = food set unless `settings.comparisonSet === 'food'` (decision #10). This is the single source of truth the popup renders — `src/ui/*` stays thin.

Tests: known store → known band/string pair; empty chat scope → `null` (empty state); secondary skipped when set matches.

### Task 22: Popup scopes UI

**Files:**
- Create: `src/ui/scopes.ts`, modify `src/ui/app.ts`, `src/ui/style.css`

Per PRD §5.1 mockup:
- Segmented control: This chat / Today / Week / Month.
- "This chat" needs the active tab's key: popup → `browser.runtime.sendMessage({type:'GET_ACTIVE_CONVERSATION'})` → background `browser.tabs.query({active:true,currentWindow:true})` → `browser.tabs.sendMessage(tabId, {type:'GET_CONVERSATION_KEY'})` → content script returns `chatKey`. If the active tab is unsupported/unreachable → empty state (R5.1.3/R5.1.4).
- Headline = comparison string (always first, R5.1.1); subtitle = `6.8 mL (2.1–24 mL)` band (always visible, R5.1.2); meta `42 responses · ChatGPT`; secondary comparison line; `>10%` estimated footnote (R6.5); degraded banner if the active tab reported `degraded` (R9.4); model version footer.

Vanilla TS: `scopes.ts` exposes `renderScopes(container, view)` and `mountScopes(container)` — `mountScopes` holds a small `state` object (current scope, active-tab chatKey), re-renders the scopes section by clearing and rebuilding DOM on state change (reference popup style: direct DOM manipulation, event listeners attached per render). Load store + resolve active tab key on mount and on scope switch; re-read `repo.load()` per render so settings changes reflect immediately (R6.1). `GET_ACTIVE_CONVERSATION` handled in background (Task 23 addendum).

### Task 23: Empty/degraded states + background GET_ACTIVE_CONVERSATION

**Files:**
- Modify: `entrypoints/background.ts`, `src/ui/scopes.ts`

Empty states: unsupported tab → "Open a supported AI chat to see this conversation's water use."; zero counters → "Nothing tracked yet today."; paused tracking → "Tracking is paused" + Settings link. Never scolding (R5.1.4). Manual verify all four scopes + each empty state.

**M2 exit check:** `pnpm test` green; four scopes render correct figures and bands against a seeded store (dev button in Task 6 becomes "Seed demo data" for QA).

---

# Milestone M3 — Methodology panel, settings, docs

**Exit criteria:** every coefficient traceable to a source.

### Task 24: Methodology panel

**Files:**
- Create: `src/ui/methodology.ts`

Full-height view inside the popup (PRD §5.2): the formula written out (PRD §6.1); a table of every coefficient with current value, low/mid/high, and source (from `COEFFICIENT_SOURCES`); plain-English on-site vs indirect/grid water; named limitations (hidden reasoning tokens, unknown data-center region, `chars/4` approximation, the blended reasoning multiplier, lifecycle-vs-on-site scope mismatch labels); `modelVersion` + changelog link; repo link. Rendered as a section toggled from the popup.

### Task 25: Settings view + persistence

**Files:**
- Create: `src/ui/settings.ts`, modify `src/storage/repo.ts` (add `getSettings`/`saveSettings`)

PRD §5.3 controls: accounting mode, energy tier, WUE, units, comparison set, tracking toggle, Data (Export / Reset — Task 27). All persist to `store.settings`. Changing accounting/energy/WUE immediately re-renders the scope view (coefficients computed at render time, R6.1).

### Task 26: Tracking toggle gates ingest

`store.settings.tracking === false` → background drops `TURN_SAMPLE` (returns `{accepted:false, paused:true}`) and content scripts may skip observation entirely (cheaper). Verify: pause → new turns not counted; resume → counted from resume (no backfill).

### Task 27: Export JSON + Reset all

**Files:**
- Modify: `src/ui/settings.ts`

Export: serialize `store` (the raw counters, per R6.1) → Blob → `<a download>` with `droplet-export-<date>.json`. Reset: two-step confirm → `browser.storage.local.clear()` + re-init empty store. Share card reuses the same download helper (Task 31).

### Task 28: METHODOLOGY.md

Mirrors the methodology panel but as the canonical doc: the formula, every coefficient + source URL, calibration note (the 0.24 Wh cross-check), the reasoning-blend disclosure, named exclusions (PRD §6.4), the "the spread is driven by the energy assumption" insight (PRD §6.2). Linked from README, methodology panel, and the share card.

### Task 29: PRIVACY.md

PRD §8 is the outline. Must state plainly (PRD §8.2): what is never touched; that `charCount` is the one place rendered text is measured, length-only, never stored or sent; `chrome.storage.local` only, never sync; zero network, CI-enforced; the accepted blindness (§8.5). Read the reference's `PRIVACY.md` for tone/shape.

### Task 30: Model version + changelog

`src/ui/methodology.ts` renders `COEFFICIENTS.modelVersion`; link to `https://github.com/<repo>/blob/main/src/model/coefficients.ts` changelog in repo (a `CHANGELOG.md` with a `## 0.1.0` entry listing coefficient changes, per R6.4).

**M3 exit check:** every coefficient in the panel links to a source URL.

---

# Milestone M4 — Share card, export/reset, assert-no-network CI gate

**Exit criteria:** CI fails on an introduced `fetch`.

### Task 31: Share card (canvas → PNG download)

**Files:**
- Create: `src/ui/share-card.ts`

Renders a `<canvas>` (1200×630) in the popup (hidden or in a modal) showing: scope label, comparison headline, `mL (low–high)` band, response count, provider, and `github.com/<repo>` + `droplet` wordmark. `canvas.toBlob()` → download via the Task 27 helper. **No upload, no share endpoint** (PRD §5.4). Verify the PNG downloads and is legible.

### Task 32: Copy to clipboard

`navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` (no clipboard permission needed for write; wrapped in try/catch). Button: "Copy" + "Download". Manual QA in popup context (clipboard writes can be restricted in some contexts — fall back gracefully to "Download only" if it throws).

### Task 33: assert-no-network script

**Files:**
- Create: `scripts/assert-no-network.ts`

Scan bundled output (arg: dir, default `.output/chrome-mv3`) for `/\.(js|mjs)$/` files; flag regex matches for `fetch(`, `new XMLHttpRequest(`, `sendBeacon(`, `new WebSocket(` (PRD §8.4). Exit 1 on any hit with file + snippet. First run may hit false positives in bundled runtime helpers — add an `ALLOW` allowlist of exact `file:pattern` entries to the script header, but **never** allow an actual network call. Verify: `pnpm build && pnpm assert-no-network` is clean; temporarily add `fetch('')` to the popup → script fails.

### Task 34: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

`on: [push, pull_request, workflow_dispatch]`. Job: setup node 22 + pnpm, `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm assert-no-network`, `pnpm build:firefox`, `pnpm assert-no-network .output/firefox-mv2`. Release job (`on: release:published`): build, `pnpm zip` + `pnpm zip:firefox`, attach `droplet-extension.zip` to the release (PRD §11).

### Task 35: Privacy audit

Manual sweep: `rg "fetch\(|XMLHttpRequest|sendBeacon|WebSocket|chrome\.storage\.sync|indexedDB|localStorage" src/ entrypoints/` → zero hits; confirm all storage goes through `repo` (single `browser.storage.local.set` site). Also confirm no prompt/response text is ever retained (the only read is `.textContent.length`). Record results in the PR.

**M4 exit check:** CI red on an introduced `fetch`.

---

# Milestone M5 — Firefox build + store submissions

**Exit criteria:** live in both stores (PRD §11).

### Task 36: Firefox MV2 target

Already wired in `wxt.config.ts` (Task 2): `pnpm build:firefox` → `.output/firefox-mv2/`. AMO `data_collection_permissions: { required: [], optional: [] }` + fixed `gecko.id`. Verify the add-on loads in `about:debugging`, storage works, popup renders.

### Task 37: Zip artifacts

`pnpm zip` → `droplet-extension.zip`; `pnpm zip:firefox` → `droplet-extension-firefox.zip` (per-browser names already configured). Verify both zips unpack cleanly and load.

### Task 38: README

PRD §11: Overview → Supported sites → Installation → Build from Source → Install Build → How it works → Permissions → Privacy, mirroring the reference README's shape. Include "no data collected" in the first paragraph and the `assert-no-network` gate in the build section.

### Task 39: Store listing + docs

Store listing copy: **no data collected**, open source, `METHODOLOGY.md` link. Chrome Web Store + AMO submissions from the same artifacts. Keep the install-from-source instructions so reviewers can verify the build themselves (PRD §11 #3).

---

# Milestone M6 — Claude, Gemini, Grok adapters

**Exit criteria:** each adapter ≤ one file (PRD G5, M6).

Each task follows the same shape as Tasks 9–11:
1. Copy `src/adapters/chatgpt.ts` → the new host file; swap selectors; keep the `SiteAdapter` contract, completion detection (stop-control + quiet debounce), and `TurnSample` emission identical.
2. Add a `.content.ts` entrypoint with the host's `matches`.
3. Add the host to `host_permissions` in `wxt.config.ts` **only in this task** (PRD §4: no host permission until its adapter ships).
4. Register in `registry.ts`; bump `ProviderId`.
5. Verify selectors live (reference chatwait selectors are strong starting points — re-verify dates), then run a manual tally + reasoning-turn check per host.

### Task 40: Claude adapter

Starting selectors from the reference (verified 2026-06-12 / 2026-08-06): send `button[aria-label="Send message"]`, composer `[data-testid="chat-input"]`, user msg `[data-testid="user-message"]`, streaming flag `[data-is-streaming="true"]` (this is the completion signal — wait for it to flip false + 1200 ms quiet), history-load settling window (reference claude.ts). Conversation id from `/c/<uuid>` in the URL.

### Task 41: Gemini adapter

Reference selectors: send `button[aria-label="Send message"]`, composer `rich-textarea [contenteditable]`, user `user-query`, model `model-response`; transient→permanent turn swap needs re-baselining (count only the permanent one, on completion). Conversation id from URL `/app/<uuid>` or `/c/<uuid>` (verify live).

### Task 42: Grok adapter

New territory (no reference adapter). Document the discovery process in the task: map the DOM manually, choose selectors, verify a 20-turn tally. Conversation id from `/c/<id>` (verify). Flag for the owner that `chat.deepseek.com` (PRD §4 "evaluate") is explicitly not in v1.

---

## Cross-cutting verification commands (run at each milestone end)

```bash
pnpm typecheck       # tsc --noEmit, strict
pnpm test            # node:test over scripts/*.test.mjs
pnpm build && pnpm assert-no-network
pnpm build:firefox && pnpm assert-no-network .output/firefox-mv2
```

## Risks & open items inherited from the PRD

- **ChatGPT DOM redesign** (PRD §14, high): mitigated by selector fallback chains, `degraded` state, adapter versioning, and the live-verification discipline recorded in selector comments. A failing tally in Task 15 blocks M1.
- **Energy assumption sensitivity**: band + exposed energy tier + methodology panel are the answer; Task 16's calibration test pins the Mid point.
- **Open decisions** (PRD §15) that the plan assumes: local-only (yes, no backend), MIT license, neutral tone, Firefox in v1, name `Droplet` as placeholder. Inline badge deferred (not in any milestone). Grok after Claude/Gemini.
- **The `seen` ring being global** (decision #4) is the one deliberate deviation from R9.2's "per conversation" wording; flagged in METHODOLOGY.md and tracked as a future improvement.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-08-07-droplet-implementation.md`. Two execution options:

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — open a new session with `executing-plans`, batch execution with checkpoints.

Which approach?
