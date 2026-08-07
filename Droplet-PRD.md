# Droplet — Product Requirements Document

> Working name: **Droplet** · repo: `droplet/droplet-extension`
> Status: Draft v0.1 · Owner: Thanveer · Last updated: 2026-08-07

Droplet is a browser extension that estimates how much water was consumed by your AI chat usage — for this chat, today, this week, or this month — and expresses it in units people actually understand (a teaspoon, a shower, an almond).

The extension is open source and intentionally minimal: **it does not read prompts or AI responses, and it makes no network requests.**

---

## 1. Why this exists

The public conversation about AI and water runs on two bad numbers: "every prompt drinks a bottle of water" on one side, and "it's a rounding error, stop asking" on the other. Neither is checkable by the person actually typing the prompts.

Droplet gives an individual user a defensible, sourced, personal estimate — with the uncertainty shown rather than hidden. The product's credibility *is* the product. If a reviewer can pull the methodology apart in a comment thread, we have shipped nothing.

**Positioning:** context tool, not guilt meter. The honest output for a heavy user is small, and we say so plainly. That framing is more defensible, more shareable, and more likely to survive contact with a technical audience.

---

## 2. Goals / Non-goals

### Goals
- G1. Show a personal water estimate scoped to this chat / today / this week / this month / all time.
- G2. Express every figure through a relatable physical comparison, auto-selected by magnitude.
- G3. Make the methodology fully inspectable in-product, with a low/high band rather than a false-precision point estimate.
- G4. Collect zero data. No prompt text, no response text, no network calls, no account.
- G5. Ship a site-adapter architecture so adding Claude / Gemini / Grok is one file each.

### Non-goals (v1)
- N1. Carbon or energy dashboards. Water only, until the water product is right. *(Energy is computed internally; we just don't surface it as a headline yet.)*
- N2. Any backend, account, sync, or leaderboard.
- N3. Cross-device history.
- N4. Coverage of desktop apps, mobile apps, or API usage. Browser sessions only.
- N5. Offsets, donations, or any "neutralize your usage" commerce.

---

## 3. Users

| Segment | Why they install | What they need |
|---|---|---|
| Curious heavy AI user | "Am I actually the problem?" | A number, fast, with context |
| Sustainability-adjacent professional | Wants a citable figure | Methodology panel, sources |
| Developer / HN reader | Suspicious of every AI extension | Open source, readable permissions |
| Educator / journalist | Needs a demo artifact | Share card, clear band |

Primary is the first. The other three determine whether it survives launch day.

---

## 4. Supported sites

**v1.0**
- `https://chatgpt.com/*`

**v1.1+**
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://grok.com/*`
- `https://chat.deepseek.com/*` *(evaluate)*

No host permission is requested for a site until its adapter ships.

---

## 5. Product surfaces

### 5.1 Popup (primary surface)

Opened from the toolbar icon. Four scopes, tabbed or segmented:

```
┌─────────────────────────────┐
│  This chat   Today   Week   Month │
├─────────────────────────────┤
│                             │
│        ≈ 1.4 tsp            │   ← headline comparison
│      6.8 mL  (2.1 – 24 mL)  │   ← figure + band
│                             │
│  42 responses · ChatGPT     │
│                             │
│  About the same as          │
│  🌰 1.7 almonds             │   ← secondary comparison
│                             │
│  [ How this is calculated ] │
│  [ Share ]      [ Settings ]│
└─────────────────────────────┘
```

Requirements:
- R5.1.1 Headline is always the comparison, not the millilitre figure. The number is the subtitle.
- R5.1.2 The band is always visible. Never a bare point estimate.
- R5.1.3 "This chat" resolves from the active tab's conversation ID; shows an empty state if the active tab isn't a supported site.
- R5.1.4 Empty states are informative, not scolding ("Nothing tracked yet today").

### 5.2 Methodology panel

A full-height view inside the popup. Non-negotiable content:
- The formula, written out.
- Every coefficient, its current value, and its source.
- A plain-English explanation of on-site vs. indirect (grid) water.
- Named limitations, including hidden reasoning tokens and unknown data-center location.
- Link to the repo and to `METHODOLOGY.md`.

### 5.3 Settings

| Setting | Options | Default |
|---|---|---|
| Accounting mode | On-site cooling only · Including electricity generation | Including electricity |
| Energy tier | Current-gen efficient · Mid · Legacy/heavy | Mid |
| Data-center efficiency (WUE) | Hyperscaler best · Fleet typical · Industry average | Fleet typical |
| Units | mL / L · fl oz / gal | Locale-derived |
| Comparison set | Everyday · Food · Household | Everyday |
| Tracking | On · Paused | On |
| Data | Export JSON · Reset all | — |

### 5.4 Share card (v1.0, client-side only)

Renders a PNG via `<canvas>` in the popup; downloads or copies to clipboard. **No upload, no share endpoint.** Card shows scope, comparison, band, and the repo URL.

### 5.5 Inline badge — deferred

An in-page badge next to each response is tempting and is the single largest source of store-review risk and DOM fragility. **Out of scope for v1.0.** Revisit once the adapter has proven stable across two ChatGPT redesigns.

---

## 6. Estimation model

### 6.1 The formula

```
tokens_out    ≈ char_count / 4
E_Wh          = Wh_base + (tokens_out × Wh_per_token) × reasoning_multiplier
water_onsite  = E_Wh × WUE_dc          [mL]   ; WUE in L/kWh ≡ mL/Wh
water_grid    = E_Wh × EWIF_grid       [mL]   ; EWIF in L/kWh ≡ mL/Wh
water_total   = water_onsite + water_grid
```

Every coefficient lives in `src/model/coefficients.ts`, versioned, each annotated with its source URL.

### 6.2 Default coefficients

| Coefficient | Low | Mid | High | Basis |
|---|---|---|---|---|
| `Wh_base` (per response overhead) | 0.02 | 0.05 | 0.30 | Calibrated so a median ~300-token response ≈ Google's published 0.24 Wh median at Mid |
| `Wh_per_token` | 0.0002 | 0.00063 | 0.009 | Low/Mid from current-gen disclosures; High reflects 2023-era per-response estimates |
| `reasoning_multiplier` | 1.5 | 3 | 10 | Hidden thinking tokens; applied only when reasoning UI is detected |
| `WUE_dc` (mL/Wh) | 0.2 | 1.1 | 1.9 | Hyperscaler best / fleet typical / published industry average |
| `EWIF_grid` (mL/Wh) | 1.0 | 4.5 | 6.5 | US power-sector water consumption per kWh; region-dependent |

**The key modelling insight, and it belongs in the methodology panel:** the wild spread between published per-prompt water figures is almost entirely driven by the *energy* assumption, not the water coefficients. The water conversion factors are comparatively well established. This is why we expose an energy tier and show a band.

### 6.3 Rules

- R6.1 **Store raw counters, compute water at render time.** Persist `messages`, `tokens_out`, `reasoning_flag`. Never persist derived millilitres. Coefficient updates then retroactively correct all history — which is the whole reason this model can stay honest.
- R6.2 Band = model evaluated at Low and High. Headline = Mid.
- R6.3 `chars / 4` is a stated approximation, disclosed in the methodology panel.
- R6.4 Coefficients carry a `modelVersion`; the popup shows it and links to the changelog.
- R6.5 If the adapter cannot determine `char_count` for a turn, fall back to the median-response assumption and mark that turn `estimated: true`. Show a footnote when >10% of a scope's turns are fallbacks.

### 6.4 Explicitly out of model scope (documented, not silently omitted)
- Water embodied in chip fabrication and data-center construction.
- Input-token processing (folded into `Wh_base`).
- Water used by any host-side retrieval, image generation, or tool calls.
- Regional grid and data-center variation — we do not know which region served the request.

---

## 7. Comparison ladder

Auto-select the rung whose value is closest below the estimate, then express as a multiple. Never show "0.003 showers."

| Threshold | Everyday | Food | Household |
|---|---|---|---|
| 0.5 mL | drops | drops | drops |
| 5 mL | teaspoon | teaspoon | teaspoon |
| 15 mL | tablespoon | tablespoon | tablespoon |
| 250 mL | cup | cup | cup |
| 500 mL | water bottle | water bottle | water bottle |
| ~4 L | — | one almond | — |
| ~6 L | — | — | one toilet flush |
| ~50 L | — | — | an 8-minute shower |
| ~100 L | — | — | a washing-machine load |
| ~140 L | — | one cup of coffee | — |
| ~2,400 L | — | one hamburger | — |
| ~7,600 L | — | — | one pair of jeans |

Requirements:
- R7.1 Every comparison carries a source, viewable on tap. Food-footprint figures are lifecycle numbers and must be labelled as such — comparing a lifecycle footprint to on-site data-center water is exactly the scope mismatch we are trying to correct, so the label is mandatory.
- R7.2 Copy is neutral. "About the same as 1.7 almonds," never "you wasted."
- R7.3 The ladder lives in one data file so it can be localised and swapped.

---

## 8. Privacy model

This is the product's spine, and it is testable by anyone.

### 8.1 What is never touched
- Prompt text — never read, never buffered, never stored.
- Response text — never stored, never transmitted.
- Conversation titles, page titles, URLs beyond the conversation ID.
- Browsing history, cookies, tabs, clipboard, account identity.

### 8.2 What is measured
For each completed assistant turn:

| Field | Type | Notes |
|---|---|---|
| `turnKey` | string | SHA-256 of the host's message ID, truncated. Dedupe only. |
| `charCount` | integer | Computed in-page from `textContent.length`. The string is never assigned to a variable, retained, or sent — only its length survives the function call. |
| `isReasoning` | boolean | Detected from the presence of a reasoning UI container, structurally. Never by content. |
| `provider` | enum | `chatgpt` etc. |
| `ts` | integer | Timestamp, truncated to the day for aggregate rows. |

`charCount` is the one place we touch rendered text. `PRIVACY.md` must state this in plain language rather than eliding it — an unstated technicality found by a reviewer is worse than a disclosed one.

### 8.3 Storage
- `chrome.storage.local` only. **Never `chrome.storage.sync`** — sync would push usage data to the user's Google account, which contradicts the pitch.
- No IndexedDB, no cookies, no localStorage on host pages.

### 8.4 Network
- Zero outbound requests from the extension, in any code path, including error handling. No CDN fonts, no icon fetches, no telemetry, no crash reporting.
- Enforced by CI: a build-time check that fails if `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket` appear in bundled output.

### 8.5 Consequence we accept
No analytics means we are blind to product usage. We accept this. Success is measured from store metrics and repo signals only.

---

## 9. Technical architecture

### 9.1 Stack
- **WXT** (matching the reference repo's build model), TypeScript, React for the popup.
- Chrome/Chromium MV3 → `.output/chrome-mv3/`
- Firefox MV2 → `.output/firefox-mv2/`
- Node 20+, pnpm.

### 9.2 Components

**Content script** (one per supported host)
1. Resolves the site adapter from the URL.
2. Adapter attaches a `MutationObserver` to the conversation root.
3. On a *completed* assistant turn, emits a `TurnSample`.
4. Sends the sample to the background worker via `runtime.sendMessage`.

**Background service worker**
1. Receives `TurnSample`s.
2. Dedupes on `turnKey` against a capped rolling set.
3. Increments counters in the day bucket and the conversation bucket.
4. Handles storage migrations on version change.

**Popup**
1. Reads counters, applies the current coefficient set, renders.
2. Never talks to content scripts except to ask the active tab for its conversation key.

### 9.3 Site adapter contract

```ts
export interface SiteAdapter {
  id: ProviderId;
  matches(url: URL): boolean;
  /** Stable per-conversation identifier from the URL. Hashed by the caller. */
  getConversationId(url: URL): string | null;
  /** Attaches observers. Returns a teardown function. */
  observe(onTurn: (sample: TurnSample) => void): () => void;
  /** Ordered selector fallbacks, most specific first. */
  selectors: SelectorSet;
  adapterVersion: string;
}

export interface TurnSample {
  turnKey: string;
  charCount: number;
  isReasoning: boolean;
  provider: ProviderId;
}
```

Everything downstream of `TurnSample` is provider-agnostic. Adding Claude is one file plus one host permission.

### 9.4 Known hard problems and required handling

| Problem | Requirement |
|---|---|
| Streaming responses mutate continuously | R9.1 Count only on completion. Detect via the stop-generating control disappearing, plus a 1200 ms mutation-quiet debounce as fallback. Never count mid-stream. |
| Virtualised scroll re-renders old turns | R9.2 Dedupe on `turnKey`. Rolling set of the last 500 keys per conversation. |
| SPA navigation, no page reload | R9.3 Watch `history.pushState`/`popstate` and re-resolve the conversation ID. Tear down and re-attach observers on change. |
| Host DOM redesigns break selectors | R9.4 Ordered selector fallback chain. If all fail, set a `degraded` flag; the popup shows "Tracking paused — adapter needs updating" with a repo link. Silent undercounting is the worst failure mode. |
| Regenerate / edit produces duplicate-ish turns | R9.5 New host message ID = new turn, counted. Documented as intended: a regeneration genuinely costs compute. |
| Reasoning tokens are invisible | R9.6 Apply `reasoning_multiplier` when detected; widen the band for that turn; disclose in methodology. |
| Multiple tabs on the same conversation | R9.7 Background dedupe makes this a non-issue; verify with a test. |

### 9.5 Repository structure

```
droplet-extension/
├── README.md
├── PRIVACY.md
├── METHODOLOGY.md
├── LICENSE
├── package.json
├── wxt.config.ts
├── entrypoints/
│   ├── background.ts
│   ├── chatgpt.content.ts
│   └── popup/
│       ├── index.html
│       └── App.tsx
├── src/
│   ├── adapters/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   └── chatgpt.ts
│   ├── model/
│   │   ├── coefficients.ts
│   │   ├── estimate.ts
│   │   └── comparisons.ts
│   ├── storage/
│   │   ├── schema.ts
│   │   ├── repo.ts
│   │   └── migrations.ts
│   └── ui/
├── scripts/
│   └── assert-no-network.ts
└── public/icons/
```

### 9.6 Storage schema

```ts
interface Store {
  meta: { schemaVersion: number; modelVersion: string; installedAt: number };
  settings: Settings;
  days: Record<string, Record<ProviderId, Counters>>;   // "2026-08-07"
  chats: Record<string, {                                // hashed conversation id
    provider: ProviderId;
    firstSeen: number;
    lastSeen: number;
    counters: Counters;
  }>;
  seen: string[];                                        // capped dedupe ring
}

interface Counters {
  turns: number;
  tokensOut: number;
  reasoningTurns: number;
  estimatedTurns: number;   // fallback-counted
}
```

Retention: day buckets kept 400 days; chat buckets pruned after 90 days of inactivity, capped at 500 entries.

---

## 10. Permissions

Droplet requests:

- `storage` — local counters and settings only.
- Host access for supported AI sites only, one at a time as adapters ship.

No `tabs`, no `activeTab` beyond what the popup strictly needs, no `scripting`, no broad host match, no browsing-history, cookies, or clipboard-read permissions. No optional permissions.

Store listing must declare: **no data collected.**

---

## 11. Build and release

```
pnpm install
pnpm build          # Chrome/Chromium → .output/chrome-mv3/
pnpm build:firefox  # Firefox         → .output/firefox-mv2/
pnpm dev
```

Release process:
1. Tag → GitHub Action builds both targets.
2. Attach `droplet-extension.zip` to the release.
3. README documents unpacked install for people who want to verify the build themselves.
4. Chrome Web Store and Firefox Add-ons submissions from the same artifact.

`README.md` mirrors the reference repo's shape: Overview → Supported sites → Installation → Build from Source → Install Build → How it works → Permissions → Privacy.

---

## 12. Milestones

| # | Scope | Exit criteria |
|---|---|---|
| M0 | WXT skeleton, MV3 manifest, popup shell, storage layer | Loads unpacked, popup opens, storage round-trips |
| M1 | ChatGPT adapter: observe, complete-detection, dedupe, SPA nav | Counts match manual tally across a 50-turn session, including reload and scrollback |
| M2 | Estimation engine + comparison ladder + popup scopes | Four scopes render correct figures and bands |
| M3 | Methodology panel, settings, `METHODOLOGY.md`, `PRIVACY.md` | Every coefficient traceable to a source |
| M4 | Share card, export/reset, `assert-no-network` CI gate | CI fails on an introduced `fetch` |
| M5 | Firefox build, store submissions, launch post | Live in both stores |
| M6 | Claude, Gemini, Grok adapters | Each adapter ≤ one file |

---

## 13. Success criteria

No in-product analytics, so these are external:

- 1,000 Chrome Web Store installs in 90 days.
- ≥ 4.3 average rating; zero reviews alleging data collection.
- Launch discussion where the methodology is *debated* rather than dismissed. A top comment saying "the numbers are defensible, I disagree with the framing" is a win; "this is made up" is a failure.
- ≥ 1 external contributor PR to `coefficients.ts` or an adapter.

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Credibility attack on the numbers | High | Bands not points; methodology panel; sourced coefficients; open source; invite coefficient PRs |
| ChatGPT DOM redesign breaks counting | High | Selector fallback chain; explicit `degraded` state; adapter versioning; treat silent undercount as a P0 bug |
| Store review flags host access on AI sites | Medium | Minimal permissions; no page modification in v1; privacy policy that matches the code |
| "AI extension = spyware" prior | Medium | Zero network requests, CI-enforced; lead the listing with it |
| Honest numbers undercut the premise | Medium | Reframe as the point: this is a context tool. Own it in the launch copy |
| Reasoning models make estimates soft | Medium | Detect, widen band, disclose |
| Provider adds native usage reporting | Low | Would validate the category; pivot to cross-provider aggregation |

---

## 15. Open decisions

Flagged for the owner; each materially affects scope.

1. **Name.** `Droplet` is a placeholder. Alternatives in the `chat*` convention: `Chatdrop`, `Chatsip`. Domain and store availability unchecked.
2. **Local-only, confirmed?** This PRD assumes no backend, ever. A backend would enable aggregate stats, "you vs. average," and a website — at the cost of the strongest thing the product has.
3. **Inline badge.** Deferred here. If it is actually the hook rather than a nice-to-have, M1 and the risk table both change.
4. **Tone.** Written as neutral/context-first. If you want it funnier or more pointed, the copy layer changes but nothing structural does.
5. **Firefox in v1** or Chrome-only until the adapter has stabilised.
6. **Licence.** MIT assumed.
7. **Grok before or after Claude and Gemini** — ordering only.
