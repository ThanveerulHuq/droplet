# Simplify Popup to an Observe-the-Number App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the Settings tab from the popup so the main view is purely the water numbers, moving tracking pause and methodology access into unobtrusive footer controls.

**Architecture:** Delete `src/ui/settings.ts` and its mount site. The popup becomes a two-state toggle (scopes ⇄ methodology) driven by footer links. A footer "Pause/Resume tracking" button flips `store.settings.tracking` and re-renders scopes (existing paused banner). Estimation always uses the PRD defaults. No schema, model, or ingest changes — the background tracking gate and `repo.getSettings/saveSettings` already exist and are reused.

**Tech Stack:** WXT, TypeScript (strict), vanilla-TS popup (direct DOM, no framework), `node:test` via `--experimental-strip-types`.

---

## Task 1: Footer + methodology back navigation (DOM/structure)

**Files:**
- Modify: `entrypoints/popup/index.html`
- Modify: `src/ui/methodology.ts`

**Step 1: Edit `entrypoints/popup/index.html`**

Replace the entire `<div id="app">...</div>` block with:

```html
    <div id="app">
      <header>
        <h1>Droplet</h1>
      </header>
      <main>
        <!-- Scopes UI (Task 22/23): segmented control + figures/empty states, mounted by src/ui/app.ts. -->
        <section id="scopes" aria-label="Water use"></section>
        <!-- Methodology panel (Task 24): formula, coefficients + sources, limitations (PRD §5.2).
             Opened via the footer "How this works" link; closed via its own back control. -->
        <section id="methodology" aria-label="Methodology" hidden></section>
      </main>
      <footer id="buildInfo"></footer>
      <div class="footer-actions">
        <button id="trackingBtn" type="button" class="footer-btn">Pause tracking</button>
        <button id="methodologyBtn" type="button" class="footer-btn">How this works</button>
      </div>
      <button id="seedDemoBtn" type="button" class="seed-demo">Seed demo data</button>
    </div>
```

Notes: the `view-tabs` nav and `<section id="settings">` are gone. Two footer buttons are added.

**Step 2: Edit `src/ui/methodology.ts` — add a back link**

Change the `renderMethodology` signature from `renderMethodology(container: HTMLElement): void` to accept an optional back callback:

```ts
export function renderMethodology(container: HTMLElement, onBack?: () => void): void {
  container.replaceChildren();

  // ... existing content construction (formula, table, onsite, limitations) unchanged ...

  const back = el('button', 'methodology-back');
  back.type = 'button';
  back.textContent = '← Back';
  back.addEventListener('click', () => onBack?.());
  const footer = el('div', 'methodology-footer');
  footer.append(
    back,
    paragraph(`model v${COEFFICIENTS.modelVersion}`),
    link(CHANGELOG_URL, 'Model changelog'),
    link(METHODOLOGY_URL, 'METHODOLOGY.md'),
    link(REPO_URL, 'Source code'),
  );

  container.append(
    heading('How the estimate is calculated'),
    formula,
    heading('On-site vs. grid water'),
    onsite,
    heading('Coefficients and sources'),
    table,
    heading('Known limitations'),
    limitations,
    footer,
  );
}
```

**Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS (the `onBack` param is optional, so existing callers still compile).

**Step 4: Commit**

```bash
git add entrypoints/popup/index.html src/ui/methodology.ts
git commit -m "feat: footer-based popup shell and methodology back link"
```

---

## Task 2: Rewire app.ts (drop settings, two-state toggle, footer buttons)

**Files:**
- Modify: `src/ui/app.ts`

**Step 1: Replace `src/ui/app.ts` entirely**

```ts
import { log } from '../lib/log.ts';
import { mountScopes } from './scopes.ts';
import { renderMethodology } from './methodology.ts';
import { repo } from '../storage/repo.ts';
import { seedDemoStore } from '../storage/seed.ts';

let bound = false;

export function renderApp(): void {
  const buildInfo = document.getElementById('buildInfo');
  const scopes = document.getElementById('scopes');
  const methodology = document.getElementById('methodology');
  const methodologyBtn = document.getElementById('methodologyBtn');
  const trackingBtn = document.getElementById('trackingBtn');
  const seedBtn = document.getElementById('seedDemoBtn');

  if (!buildInfo || !(scopes instanceof HTMLElement) || !(methodology instanceof HTMLElement)) {
    log.warn('popup shell missing required elements');
    return;
  }

  buildInfo.textContent = browser.runtime.getManifest().version_name ?? '';

  if (bound) return;
  bound = true;

  const scopesApi = mountScopes(scopes);
  renderMethodology(methodology, () => show('scopes'));

  // Two-state view: scopes (default) or the methodology panel (footer "How this works").
  const show = (view: 'scopes' | 'methodology'): void => {
    scopes.hidden = view !== 'scopes';
    methodology.hidden = view !== 'methodology';
  };

  methodologyBtn?.addEventListener('click', () => show('methodology'));

  // Footer tracking pause (Task 26 gate): flip store.settings.tracking, re-render scopes so the
  // existing paused banner reflects the state. Button label mirrors the current state.
  const syncTracking = async (): Promise<void> => {
    if (!(trackingBtn instanceof HTMLButtonElement)) return;
    try {
      const settings = await repo.getSettings();
      trackingBtn.textContent = settings.tracking ? 'Pause tracking' : 'Resume tracking';
    } catch (err) {
      log.warn('failed to read tracking state', err);
    }
  };
  trackingBtn?.addEventListener('click', async () => {
    if (!(trackingBtn instanceof HTMLButtonElement)) return;
    trackingBtn.disabled = true;
    try {
      const settings = await repo.getSettings();
      await repo.saveSettings({ ...settings, tracking: !settings.tracking });
      await Promise.all([scopesApi.refresh(), syncTracking()]);
    } catch (err) {
      log.warn('failed to toggle tracking', err);
    } finally {
      trackingBtn.disabled = false;
    }
  });

  // QA affordance (plan M2 exit): seed a demo store so all four scopes render figures.
  const seed = seedBtn instanceof HTMLButtonElement ? seedBtn : null;
  seed?.addEventListener('click', async () => {
    seed.disabled = true;
    try {
      let chatKey: string | null = null;
      try {
        const res = (await browser.runtime.sendMessage({ type: 'GET_ACTIVE_CONVERSATION' })) as
          | { chatKey?: string | null }
          | null
          | undefined;
        chatKey = res?.chatKey ?? null;
      } catch {
        // no active tab / content script — seed the day scopes only
      }
      const store = seedDemoStore(Date.now(), chatKey);
      await repo.save(store);
      await scopesApi.refresh();
    } catch (err) {
      log.warn('seed demo data failed', err);
    } finally {
      seed.disabled = false;
    }
  });

  void syncTracking();
  show('scopes');
}
```

Notes:
- `mountSettings` import and all settings wiring are gone.
- `show` no longer touches a tab bar; it only toggles the two sections' `hidden`.
- The methodology back callback and the footer buttons drive navigation.

**Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

**Step 3: Delete `src/ui/settings.ts`**

```bash
rm src/ui/settings.ts
```

**Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck PASS; `# pass 110`.

**Step 5: Commit**

```bash
git rm src/ui/settings.ts
git add src/ui/app.ts
git commit -m "refactor: remove settings view, footer-driven navigation and tracking pause"
```

---

## Task 3: Style updates (remove tabs, add footer controls)

**Files:**
- Modify: `src/ui/style.css`

**Step 1: Remove the `.view-tabs` / `.view-tab` block and the settings styles**

Delete these blocks from `src/ui/style.css`:
- The entire `/* --- View tabs (Task 24: scopes / methodology / settings) --- */` section (`.view-tabs`, `.view-tab`, `.view-tab:hover`, `.view-tab.active`).
- The entire `/* --- Settings view (Task 25) --- */` section (`.setting-row`, `.setting-label`, `.setting-row select`, `.toggle-row`, `.toggle-label`, `.toggle-hint`).

**Step 2: Add footer control + methodology back styles**

Append to `src/ui/style.css`:

```css
/* --- Footer actions (simplify popup design) --- */

.footer-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.footer-btn {
  flex: 1;
  padding: 6px 8px;
  font-size: 11px;
  color: #48484a;
  border-color: #d1d1d6;
}

.methodology-back {
  padding: 4px 10px;
  font-size: 12px;
  color: #0a66c2;
  border-color: #d1d1d6;
}
```

**Step 3: Verify**

Run: `npm run build`
Expected: build succeeds; `.output/chrome-mv3` contains no reference to the settings view (spot-check with `rg "settings" .output/chrome-mv3/assets -l` — expect only `settings`-free assets, i.e. no `settings-*.js` chunk for the deleted module).

**Step 4: Commit**

```bash
git add src/ui/style.css
git commit -m "style: footer controls replace settings/tab styles"
```

---

## Task 4: Manual popup QA + full verification

**Files:** none (verification only).

**Step 1: Full verification suite**

Run:
```bash
npm run typecheck
npm test
npm run build
```
Expected: typecheck PASS; `# pass 110`; build succeeds.

**Step 2: Manual QA (build + load unpacked)**

Load `.output/chrome-mv3` unpacked, open the popup. Confirm:
1. Only the scopes section shows (This chat / Today / Week / Month segmented control); no Settings tab, no tab bar.
2. Footer shows version, "Pause tracking", "How this works", and the seed-demo button.
3. "How this works" opens the methodology panel; "← Back" returns to scopes.
4. "Pause tracking" → the button flips to "Resume tracking" and the paused banner renders; a new ChatGPT turn is NOT counted (background gate). "Resume tracking" restores counting from resume (no backfill).
5. "Seed demo data" still renders all four scopes with figures.
6. Units follow the locale (auto default) — spot-check the band labels.

**Step 3: Confirm exit criteria**

- No Settings tab; main view is scopes only. ✓
- Tracking pause reachable from footer and functionally gates ingest. ✓
- Methodology reachable from footer with working back navigation; coefficients still source-linked. ✓
- Typecheck + 110 tests green; build succeeds. ✓

**Step 4: Report**

Report results to the human. No commit for this task (verification only).
