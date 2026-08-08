# This Chat Live DOM Scan — Design

> **Status:** Approved 2026-08-08. Implementation plan to follow.

## Problem

The popup's "This chat" scope reads the tracked store (`store.chats[chatKey]`), so a
conversation that already has content before any *new* turn is tracked shows
"Nothing tracked yet in this conversation." The user wants the conversation's existing
generated content to be measured and displayed immediately — without waiting for the
next turn to be generated and tracked.

## Decisions

- **Ephemeral, display only.** The scan result is computed on the fly and rendered; nothing
  is written to the tracked store. No dedup against the seen-ring, no double counting with
  live turn tracking, no growth of the privacy surface. The store remains the source of
  truth for Today / Week / Month.
- **Always scan for "This chat".** Every render of the chat scope (popup open, segmented
  control click, tracking toggle refresh) requests a fresh DOM snapshot. Not a fallback
  behind the store.
- **Paused banner wins.** When `store.settings.tracking` is false, the existing paused state
  is rendered instead of the scan — consistent with the tracking-off mental model.

## Privacy constraint (AGENTS.md)

Content scripts must never read, buffer, or store prompt or response text. The only
measurement allowed is `.textContent.length` (char count), and only the length survives the
function call.

The scan complies: for each mounted assistant message node, `.textContent.length` is read;
only the aggregates `turnCount`, `totalChars`, `reasoningCount` are returned from the
content script. No text is read beyond `.length`, buffered, returned, or stored.

## Behavior

When the "This chat" scope is shown:

1. The popup resolves the active conversation (`GET_ACTIVE_CONVERSATION`, existing) and
   requests a scan (`GET_CHAT_SCAN`, new).
2. The background proxies to the active tab's content script (`SCAN_CONVERSATION`), which
   calls the adapter's `scanConversation()`.
3. The popup builds a `ScopeView` from the scan aggregates using the existing estimate
   pipeline and renders it through the existing `renderScopes`.

Edge cases:

- No active conversation / no content script / no adapter → scan `null` → existing empty
  state ("Open a supported AI chat…").
- Conversation has zero assistant messages → empty state.
- Tracking paused → paused banner (already first in `renderScopes`).
- Streaming in progress → trailing message counted at its current length; acceptable for a
  snapshot.
- Known limitation: ChatGPT virtualizes long conversations, so only *mounted* (near-viewport)
  messages are scanned, not full scrollback. Documented, not hidden.

## Architecture

### 1. Adapter capability — `src/adapters/types.ts`, `src/adapters/chatgpt.ts`

Extend `SiteAdapter` with an optional method:

```ts
scanConversation?: () => ConversationScan | null;
```

with

```ts
export interface ConversationScan {
  turnCount: number;
  totalChars: number;
  reasoningCount: number;
}
```

`chatgptAdapter.scanConversation()` queries all `[data-message-author-role="assistant"]`
nodes (mounted only), sums `node.textContent.length`, and counts assistant messages that
contain a reasoning node (structural, reusing the existing `reasoning` selectors). Returns
`null` when no assistant nodes exist.

`mockAdapter` is unchanged — the method is optional, so the interface stays compatible.

### 2. Message flow — `src/storage/` / background / content script

- **New message type:** `SCAN_CONVERSATION` (background → content script) and
  `GET_CHAT_SCAN` (popup → background).
- **Content script** (`entrypoints/chatgpt.content.ts`): handle `SCAN_CONVERSATION` by
  resolving the adapter and calling `scanConversation()`, replying `{ scan }`. Guard so a
  missing adapter returns `null`.
- **Background** (`entrypoints/background.ts`): handle `GET_CHAT_SCAN` by querying the active
  tab (same pattern as `GET_ACTIVE_CONVERSATION`) and forwarding the reply. Read-only — no
  store access, no queue serialization needed.

### 3. Model + UI — `src/model/popup.ts`, `src/ui/scopes.ts`

- New pure `buildScanView(scan, settings): ScopeView` in `src/model/popup.ts`. It synthesizes
  `Counters` from the scan (`turns = turnCount`, `tokensOut = round(totalChars / 4)`,
  `reasoningTurns = reasoningCount`, `estimatedTurns = 0`) and reuses
  `estimateBand` / `buildScenarios` / `pickComparison` / `formatVolume` / `formatComparison`
  — identical math to live tracking. Provider is `['chatgpt']`.
- `scopes.ts` `refresh()`: when `state.scope === 'chat'`, additionally request
  `GET_CHAT_SCAN`; build the view from the scan when non-null, otherwise render the empty
  state. Day scopes are untouched.

## Testing

- Pure functions only (node:test via `--experimental-strip-types`):
  - `buildScanView`: known scan → hand-computed mid band / comparison labels; empty scan
    handling; settings respected.
  - `scanConversation` aggregation math if extracted as a pure helper.
- Verification: `npm run typecheck` PASS, `npm test` (110 existing + new), `npm run build`
  succeeds.

## Out of scope

- No persistence, no dedup logic, no seen-ring changes.
- No changes to Today / Week / Month scopes or the tracked store.
- No changes to live turn tracking.
