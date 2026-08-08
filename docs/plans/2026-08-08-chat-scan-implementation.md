# This Chat Live DOM Scan Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the "This chat" scope is shown, scan the active conversation's mounted assistant messages, aggregate char counts on the fly, and display a water estimate — without persisting anything.

**Architecture:** The popup asks the background for a scan (`GET_CHAT_SCAN`); the background proxies to the active tab's content script (`SCAN_CONVERSATION`); the content script calls the adapter's new optional `scanConversation()` which returns only `{ turnCount, totalChars, reasoningCount }`. The popup builds a `ScopeView` via a new pure `buildScanView()` reusing the existing estimate pipeline. Nothing is written to the tracked store; the scan is ephemeral display-only. Paused tracking still shows the paused banner.

**Tech Stack:** WXT, TypeScript (strict), vanilla-TS popup, `node:test` via `--experimental-strip-types`.

**Design doc:** `docs/plans/2026-08-08-chat-scan-design.md` (approved).

**Working-tree note:** `entrypoints/popup/index.html`, `src/ui/app.ts`, `src/ui/scopes.ts`, `src/ui/style.css` carry UNCOMMITTED changes from the tracking-switch / footer-link work. Commit that work FIRST (`git add` those four files, commit e.g. `feat: tracking switch and footer methodology link`) so this plan starts from a clean tree and each task's commit stays scoped.

---

## Task 1: `ConversationScan` type + `buildScanView` (TDD)

**Files:**
- Modify: `src/adapters/types.ts`
- Modify: `src/model/popup.ts`
- Test: `scripts/popup.test.mjs`

**Step 1: Write the failing tests**

Append to `scripts/popup.test.mjs`:

```js
import { buildScanView } from '../src/model/popup.ts';

// scan with 42 assistant messages, 12600 total chars (3150 tokens at 4 chars/token).
const SCAN = { turnCount: 42, totalChars: 12600, reasoningCount: 0 };
const SCAN_SETTINGS = { ...DEFAULT_SETTINGS, units: 'metric' };

test('buildScanView: known scan maps to a hand-computed mid band', () => {
  const view = buildScanView(SCAN, SCAN_SETTINGS);
  // counters: turns=42, tokensOut=3150, reasoningTurns=0, estimatedTurns=0
  // mid scenario: energy = 42*0.05 + 3150*0.00063 = 2.1 + 1.9845 = 4.0845 Wh
  // water = 4.0845*1.1 + 4.0845*4.5 = 22.8732 mL
  assert.ok(view);
  assert.deepEqual(view.counters, { turns: 42, tokensOut: 3150, reasoningTurns: 0, estimatedTurns: 0 });
  assert.ok(Math.abs(view.band.mid - 22.8732) < 1e-9);
  assert.equal(view.volumeLabel, '22.9 mL');
  assert.deepEqual(view.provider, ['chatgpt']);
});

test('buildScanView: primary label matches formatComparison for the mid band', () => {
  const view = buildScanView(SCAN, SCAN_SETTINGS);
  assert.ok(view);
  assert.equal(view.primary.rung.name, 'tablespoon');
  assert.equal(view.primary.label, '≈1.5 tablespoons');
});

test('buildScanView: secondary is null when comparisonSet is food', () => {
  const view = buildScanView(SCAN, { ...SCAN_SETTINGS, comparisonSet: 'food' });
  assert.ok(view);
  assert.equal(view.secondary, null);
});

test('buildScanView: reasoningTurns propagate and estimatedRatio stays 0', () => {
  const view = buildScanView({ turnCount: 10, totalChars: 4000, reasoningCount: 3 }, SCAN_SETTINGS);
  assert.ok(view);
  assert.equal(view.counters.reasoningTurns, 3);
  assert.equal(view.counters.estimatedTurns, 0);
  assert.equal(view.estimatedRatio, 0);
});

test('buildScanView: zero-turn scan returns null', () => {
  assert.equal(buildScanView({ turnCount: 0, totalChars: 0, reasoningCount: 0 }, SCAN_SETTINGS), null);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `buildScanView is not a function` / module not exporting.

**Step 3: Add the `ConversationScan` type**

In `src/adapters/types.ts`, add after the `TurnSample` interface:

```ts
export interface ConversationScan {
  turnCount: number;
  totalChars: number;
  reasoningCount: number;
}
```

**Step 4: Implement `buildScanView`**

In `src/model/popup.ts`, add the import:

```ts
import type { ConversationScan } from '../adapters/types.ts';
```

Add the function below `buildScopeView`:

```ts
/** Ephemeral chat-scope view built from a live DOM scan (no store writes). Returns null for an empty scan. */
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
    provider: ['chatgpt'],
    estimatedRatio: estimatedRatio(counters),
    volumeLabel: formatVolume(band.mid, settings.units),
  };
}
```

**Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: FAIL only where `buildScanView` returns `null` for the zero-turn case — no wait, expected PASS for all five new tests. Verify: `# pass` increases by 5, `# fail 0`.

**Step 6: Commit**

```bash
git add src/adapters/types.ts src/model/popup.ts scripts/popup.test.mjs
git commit -m "feat: chat scan type and scope view builder (TDD)"
```

---

## Task 2: `chatgptAdapter.scanConversation` (TDD)

**Files:**
- Modify: `src/adapters/chatgpt.ts`
- Test: `scripts/chatgpt-scan.test.mjs` (create)

**Step 1: Write the failing test**

Create `scripts/chatgpt-scan.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateScan } from '../src/adapters/chatgpt.ts';

test('aggregateScan: sums lengths and counts reasoning nodes', () => {
  const nodes = [
    { length: 1200, hasReasoning: false },
    { length: 600, hasReasoning: true },
  ];
  assert.deepEqual(aggregateScan(nodes), { turnCount: 2, totalChars: 1800, reasoningCount: 1 });
});

test('aggregateScan: empty node list returns null', () => {
  assert.equal(aggregateScan([]), null);
});

test('aggregateScan: zero-length node still counts as a turn', () => {
  assert.deepEqual(aggregateScan([{ length: 0, hasReasoning: false }]), { turnCount: 1, totalChars: 0, reasoningCount: 0 });
});
```

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test scripts/chatgpt-scan.test.mjs`
Expected: FAIL — `aggregateScan is not a function`.

**Step 3: Implement**

In `src/adapters/chatgpt.ts`, add the import:

```ts
import type { ConversationScan } from './types.ts';
```

Add the pure aggregation helper at module top level (after `chatgptAdapter`'s constants, before `chatgptAdapter` — note the adapter object references it below):

```ts
export interface ScanNodeInput { length: number; hasReasoning: boolean; }

/** Pure aggregation: only lengths (char counts) are inputs; only totals leave this function. */
export function aggregateScan(nodes: ScanNodeInput[]): ConversationScan | null {
  if (nodes.length === 0) return null;
  return {
    turnCount: nodes.length,
    totalChars: nodes.reduce((sum, n) => sum + n.length, 0),
    reasoningCount: nodes.filter((n) => n.hasReasoning).length,
  };
}
```

Inside `chatgptAdapter`, after `selectors`, add:

```ts
// Privacy rule: per node only `.textContent.length` is read; only the aggregate numbers
// (`turnCount`, `totalChars`, `reasoningCount`) are returned. No text is buffered or stored.
scanConversation(): ConversationScan | null {
  const { assistantMessage, reasoning } = selectors;
  const reasoningSelector = reasoning.join(',');
  const nodes = document.querySelectorAll<HTMLElement>(assistantMessage.join(','));
  const inputs: ScanNodeInput[] = [];
  for (const node of nodes) {
    inputs.push({
      length: node.textContent.length,
      hasReasoning: node.querySelector(reasoningSelector) !== null,
    });
  }
  return aggregateScan(inputs);
},
```

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test scripts/chatgpt-scan.test.mjs`
Expected: PASS (3 tests). Then `npm test` for the full suite — all pass.

**Step 5: Commit**

```bash
git add src/adapters/chatgpt.ts scripts/chatgpt-scan.test.mjs
git commit -m "feat: chatgpt adapter live DOM scan (TDD)"
```

---

## Task 3: Content script `SCAN_CONVERSATION` handler

**Files:**
- Modify: `entrypoints/chatgpt.content.ts`

**Step 1: Add the handler**

In `entrypoints/chatgpt.content.ts`, extend the existing `onMessage` listener (currently only handles `GET_CONVERSATION_KEY`) to also answer `SCAN_CONVERSATION`:

```ts
browser.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg.type === 'GET_CONVERSATION_KEY') return Promise.resolve({ chatKey: currentChatKey });
  if (msg.type === 'SCAN_CONVERSATION') return Promise.resolve({ scan: adapter.scanConversation?.() ?? null });
});
```

**Step 2: Verify typecheck + build**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: succeeds; built `chunks/popup-*.js` contains no `settings` chunk (unchanged behavior), content script bundles without error.

**Step 3: Commit**

```bash
git add entrypoints/chatgpt.content.ts
git commit -m "feat: content script answers SCAN_CONVERSATION"
```

---

## Task 4: Background `GET_CHAT_SCAN` proxy

**Files:**
- Modify: `entrypoints/background.ts`

**Step 1: Add the message type**

In `entrypoints/background.ts`, extend the `IncomingMessage` union:

```ts
  | { type: 'GET_CHAT_SCAN' }
```

**Step 2: Add the handler**

Mirror the `GET_ACTIVE_CONVERSATION` block (same active-tab resolution, read-only proxy, no queue). Add after the `GET_ACTIVE_CONVERSATION` block:

```ts
if (message.type === 'GET_CHAT_SCAN') {
  // Read-only proxy: popup asks for a live DOM scan of the active conversation. The scan
  // result is ephemeral (never written to the store) and only carries aggregate char counts.
  void (async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { respond({ scan: null }); return; }
      try {
        const res = (await browser.tabs.sendMessage(tab.id, { type: 'SCAN_CONVERSATION' })) as
          | { scan?: { turnCount: number; totalChars: number; reasoningCount: number } | null }
          | null
          | undefined;
        respond({ scan: res?.scan ?? null });
      } catch {
        respond({ scan: null }); // tab not running a content script
      }
    } catch (err) {
      log.warn('GET_CHAT_SCAN failed', err);
      respond({ scan: null });
    }
  })();
  return true;
}
```

**Step 3: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck PASS; `# pass` 110 + 5 + 3, `# fail 0`.

**Step 4: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: background proxies live chat scan requests"
```

---

## Task 5: Wire the scan into the "This chat" scope

**Files:**
- Modify: `src/ui/scopes.ts`

**Step 1: Add imports + scan requester**

In `src/ui/scopes.ts`, add to the imports:

```ts
import type { ConversationScan } from '../adapters/types.ts';
import { buildScanView } from '../model/popup.ts';
```

Add a requester next to `resolveActiveChat`:

```ts
async function requestChatScan(): Promise<ConversationScan | null> {
  try {
    const res = (await browser.runtime.sendMessage({ type: 'GET_CHAT_SCAN' })) as
      | { scan?: ConversationScan | null }
      | null
      | undefined;
    return res?.scan ?? null;
  } catch (err) {
    log.warn('failed to scan current chat', err);
    return null;
  }
}
```

**Step 2: Use the scan in `refresh()`**

In `mountScopes`'s `refresh()`, replace the single `buildScopeView` call with a chat-vs-day branch (note the extra `renderSeq` guard after the awaited scan — `refresh` now has a second await):

```ts
    let view: ScopeView | null;
    if (state.scope === 'chat') {
      const scan = await requestChatScan();
      if (seq !== renderSeq) return;
      view = scan ? buildScanView(scan, store.settings) : null;
    } else {
      view = buildScopeView(store, store.settings, state.scope, state.chatKey);
    }
    renderScopes(container, view, state, setScope);
```

**Step 3: Verify typecheck + tests + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck PASS; `# pass` 118, `# fail 0`; build succeeds.

**Step 4: Commit**

```bash
git add src/ui/scopes.ts
git commit -m "feat: this-chat scope shows live DOM scan metrics"
```

---

## Task 6: Full verification + exit criteria

**Files:** none (verification only).

**Step 1: Full suite**

Run:
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck PASS; `# pass 118`, `# fail 0`; build succeeds.

**Step 2: Manual QA (build + load unpacked)**

Load `.output/chrome-mv3` unpacked, open a ChatGPT conversation that already has several assistant messages. Open the popup:

1. "This chat" shows a headline figure, a volume range, "N responses · ChatGPT", and the model version footer — populated from the existing conversation, NOT "Nothing tracked yet in this conversation."
2. "Today" / "Week" / "Month" are unchanged (tracked store).
3. Pause tracking (top switch) → "This chat" shows the paused banner, not numbers.
4. A brand-new empty conversation → "This chat" shows the empty state.
5. Confirm no store writes: check `chrome.storage.local` `droplet_store` `chats` did not gain entries from scanning (the tracked store only changes from real turns).

**Step 3: Confirm exit criteria**

- "This chat" renders live metrics from the current conversation's mounted assistant messages. ✓
- Scan results are ephemeral — nothing persisted, no dedup surface. ✓
- Paused banner still wins over the scan. ✓
- Day scopes and live tracking unchanged. ✓
- Typecheck + 118 tests green; build succeeds. ✓

**Step 4: Report**

Report results to the human. No commit for this task (verification only).
