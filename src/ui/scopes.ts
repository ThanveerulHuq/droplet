import type { ConversationScan } from '../adapters/types.ts';
import type { ProviderId, Units } from '../storage/schema.ts';
import type { Scope } from '../model/aggregate.ts';
import type { ScopeView } from '../model/popup.ts';
import { buildScanView, buildScopeView } from '../model/popup.ts';
import { repo } from '../storage/repo.ts';
import { formatVolume } from '../lib/units.ts';
import { log } from '../lib/log.ts';

const SCOPES: ReadonlyArray<{ id: Scope; label: string }> = [
  { id: 'chat', label: 'This chat' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const PROVIDER_LABELS: Record<ProviderId, string> = { chatgpt: 'ChatGPT' };

export interface ScopesState {
  scope: Scope;
  chatKey: string | null;
  degraded: boolean;
  paused: boolean;
  units: Units;
}

interface ActiveChat { chatKey: string | null; degraded: boolean; }

function providerLabel(id: ProviderId): string {
  return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

async function resolveActiveChat(): Promise<ActiveChat> {
  try {
    const res = (await browser.runtime.sendMessage({ type: 'GET_ACTIVE_CONVERSATION' })) as
      | { chatKey?: string | null; degraded?: boolean }
      | null
      | undefined;
    return { chatKey: res?.chatKey ?? null, degraded: Boolean(res?.degraded) };
  } catch (err) {
    log.warn('failed to resolve active conversation', err);
    return { chatKey: null, degraded: false };
  }
}

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

function zeroCountersText(scope: Scope): string {
  switch (scope) {
    case 'today': return 'Nothing tracked yet today.';
    case 'week': return 'Nothing tracked this week yet.';
    case 'month': return 'Nothing tracked this month yet.';
    default: return 'Nothing tracked yet.';
  }
}

function el(tag: keyof HTMLElementTagNameMap, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function segmentedControl(active: Scope, onSelect: (scope: Scope) => void): HTMLElement {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Time scope');
  for (const { id, label } of SCOPES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-btn';
    btn.textContent = label;
    btn.setAttribute('aria-pressed', String(id === active));
    if (id === active) btn.classList.add('active');
    btn.addEventListener('click', () => onSelect(id));
    group.appendChild(btn);
  }
  return group;
}

function degradedBanner(): HTMLElement {
  const banner = el('div', 'degraded');
  banner.textContent = "Tracking may be incomplete — ChatGPT's interface changed.";
  return banner;
}

function emptyState(message: string): HTMLElement {
  const p = el('p', 'empty');
  p.textContent = message;
  return p;
}

function pausedState(): HTMLElement {
  const box = el('div', 'paused');
  const title = el('p', 'paused-title');
  title.textContent = 'Tracking is paused';
  const note = el('p', 'paused-note');
  note.textContent = 'Nothing is being counted right now. You can resume tracking above.';
  box.append(title, note);
  return box;
}

function appendView(body: HTMLElement, view: ScopeView, state: ScopesState): void {
  const reading = el('section', 'estimate-reading');
  body.appendChild(reading);

  const headline = el('p', 'headline');
  headline.textContent = view.primary.label;

  const low = formatVolume(view.band.low, state.units);
  const high = formatVolume(view.band.high, state.units);
  const subtitle = el('p', 'subtitle');
  subtitle.textContent = `${view.volumeLabel} (${low} – ${high})`;

  const counters = view.counters;
  const providers = view.provider.map(providerLabel).join(', ');
  const meta = el('p', 'meta');
  if (counters) {
    meta.textContent = `${counters.turns} ${counters.turns === 1 ? 'response' : 'responses'} · ${providers}`;
  } else {
    meta.textContent = providers;
  }

  reading.append(headline, subtitle);

  reading.appendChild(meta);
}

/**
 * Pure-ish render: clears `container`, rebuilds the segmented control plus either a
 * ScopeView or an empty state. All inputs are passed in — the mutable `state` lives in
 * mountScopes; onSelectScope re-renders through it. No innerHTML, direct DOM only.
 */
export function renderScopes(
  container: HTMLElement,
  view: ScopeView | null,
  state: ScopesState,
  onSelectScope: (scope: Scope) => void,
): void {
  container.replaceChildren();

  if (state.degraded) container.appendChild(degradedBanner());
  container.appendChild(segmentedControl(state.scope, onSelectScope));

  const body = el('div', 'scopes-body');
  container.appendChild(body);

  if (state.paused) {
    body.appendChild(pausedState());
    return;
  }

  if (view === null) {
    const message = state.scope === 'chat' && state.chatKey !== null
      ? 'Nothing tracked yet in this conversation.'
      : "Open a supported AI chat to see this conversation's water use.";
    body.appendChild(emptyState(message));
    return;
  }

  if (state.scope !== 'chat' && view.counters !== null && view.counters.turns === 0) {
    body.appendChild(emptyState(zeroCountersText(state.scope)));
    return;
  }

  appendView(body, view, state);
}

export function mountScopes(container: HTMLElement): { refresh: () => Promise<void> } {
  const state: ScopesState = { scope: 'today', chatKey: null, degraded: false, paused: false, units: 'auto' };

  let renderSeq = 0;

  async function refresh(): Promise<void> {
    const seq = ++renderSeq;
    try {
      const [store, chat] = await Promise.all([repo.load(), resolveActiveChat()]);
      if (seq !== renderSeq) return;
      state.paused = !store.settings.tracking;
      state.units = store.settings.units;
      state.chatKey = chat.chatKey;
      state.degraded = chat.degraded;
      let view: ScopeView | null;
      if (state.scope === 'chat') {
        const scan = await requestChatScan();
        if (seq !== renderSeq) return;
        view = scan ? buildScanView(scan, store.settings) : null;
      } else {
        view = buildScopeView(store, store.settings, state.scope, state.chatKey);
      }
      renderScopes(container, view, state, setScope);
    } catch (err) {
      if (seq !== renderSeq) return;
      log.warn('scopes refresh failed', err);
      container.replaceChildren();
      container.appendChild(emptyState("Couldn't load your tracking data."));
    }
  }

  function setScope(scope: Scope): void {
    state.scope = scope;
    void refresh();
  }

  void refresh();

  return { refresh };
}
