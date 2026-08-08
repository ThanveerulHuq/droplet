# Droplet — Simplify popup to an "observe the number" app

> **Status:** Approved. Follow-up: writing-plans → implementation.

## Context

Droplet is a fun, privacy-first extension that shows "water used by your AI chats". The popup's Settings tab (built in M3, Tasks 24–26) exposes six technical controls — accounting mode, energy tier, WUE, units, comparison set, tracking — that contradict the app's pitch. The estimate always renders a low/mid/high band (R5.1.2), so the estimation settings only move where the *midpoint* lands. They are optional complexity.

Goal: remove the Settings tab entirely, keep the main view purely about the numbers, and retain the one functional control (tracking pause) plus the required methodology content as unobtrusive footer affordances.

## Decisions

1. **Remove the Settings tab and view entirely.** Delete `src/ui/settings.ts` and its mount site. Estimation always uses the PRD defaults: `energyTier: 'mid'`, `wue: 'fleet'`, `accountingMode: 'total'`, `units: 'auto'`, `comparisonSet: 'everyday'`. The low/mid/high band is unchanged — the settings' only effect (moving the midpoint) now simply sits at the default.
2. **Tracking On/Paused moves to the popup footer.** A small "Pause tracking" / "Resume tracking" button flips `store.settings.tracking` and re-renders scopes so the existing paused banner shows. This keeps the functional pause control without a settings screen.
3. **Methodology moves out of the top tab bar into a footer link.** "How this works" opens the existing methodology panel in place, with a "← Back" link to return to the scopes view. Content is unchanged (coefficients + sources remain traceable, satisfying M3's exit check).
4. **Top view bar is removed.** The scopes section (This chat / Today / Week / Month) is the only top-level view.
5. **Drop Task 27 (Export JSON + Reset all) from M3.** With no settings view there is no natural home for it, and it is not core to observing the number. If needed later, it returns as a footer item.
6. **No schema or estimate changes.** `Settings` type, `DEFAULT_SETTINGS`, `buildScenarios`, `estimateBand`, the background tracking gate, and `repo.getSettings/saveSettings` all remain — they are the plumbing the footer controls and the default estimate rely on. No migration.

## Architecture

- **`entrypoints/popup/index.html`** — remove the `view-tabs` nav and the `<section id="settings">`. Scopes section stays; methodology section stays but hidden until opened. Footer gains: version (existing `#buildInfo`), a "How this works" link, and a tracking pause button.
- **`src/ui/app.ts`** — drop `mountSettings`; keep `mountScopes` + `renderMethodology`. `show(view)` shrinks to a two-state toggle (scopes ⇄ methodology) driven by the footer link and a back link. The seed-demo QA button stays.
- **`src/ui/methodology.ts`** — add a "← Back" control (or accept a callback to return). Content unchanged.
- **`src/ui/settings.ts`** — deleted.
- **`src/ui/scopes.ts`** — unchanged (paused banner and units auto-detect already render from `store.settings`, which the footer mutates).
- **`src/ui/style.css`** — remove `.view-tabs` styles; add footer link/button styles.

## Data flow

- Footer pause button: `repo.getSettings()` → flip `tracking` → `repo.saveSettings()` → `scopesApi.refresh()` (existing paused banner renders).
- Footer "How this works": toggle scopes section `hidden` → show methodology section → back link reverses.
- Estimation: `buildScopeView(store, store.settings, scope, chatKey)` — unchanged, now always default settings.

## Error handling

- Pause save failure: log and keep the button state (scopes refresh may show stale tracking; the paused banner only renders on a successful save + refresh).
- Methodology back: pure DOM toggle; no storage involved.

## Testing

- Pure logic: unchanged — no model/schema/ingest edits, so `node --test` stays green (110 tests).
- Manual popup QA (build + load unpacked): footer shows version + "How this works" + pause button; pausing shows the banner and stops counting (background gate, already tested); "How this works" opens methodology and "← Back" returns; seed-demo still renders all four scopes.
- `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Exit criteria

- No Settings tab; main view is scopes only.
- Tracking pause reachable from the footer and functionally gates ingest (existing gate).
- Methodology reachable from the footer with working back navigation; coefficients still source-linked.
- Typecheck + 110 tests green; build succeeds.
