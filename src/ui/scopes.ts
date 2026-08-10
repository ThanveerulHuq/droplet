import type { ConversationScan } from '../adapters/types.ts';
import type { ProviderId, Store, Units } from '../storage/schema.ts';
import type { Scope } from '../model/aggregate.ts';
import type { ScopeView } from '../model/popup.ts';
import { buildScanView, buildScopeView } from '../model/popup.ts';
import { repo } from '../storage/repo.ts';
import { formatVolume } from '../lib/units.ts';
import { log } from '../lib/log.ts';
import { buildPaceProjection, type PaceProjection } from '../model/projection.ts';

type ScopeIcon = 'chat' | 'today' | 'week' | 'month';

const SCOPES: ReadonlyArray<{ id: Scope; label: string; icon: ScopeIcon }> = [
  { id: 'chat', label: 'This chat', icon: 'chat' },
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'week', label: 'Week', icon: 'week' },
  { id: 'month', label: 'Month', icon: 'month' },
];

const PROVIDER_LABELS: Record<ProviderId, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };

export interface ScopesState {
  scope: Scope;
  chatKey: string | null;
  degraded: boolean;
  paused: boolean;
  units: Units;
}

interface ActiveChat { chatKey: string | null; degraded: boolean; isSupported: boolean; }

function providerLabel(id: ProviderId): string {
  return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

const SUPPORTED_HOSTS = new Set(['chatgpt.com', 'claude.ai', 'gemini.google.com']);

function isSupportedUrl(url: string): boolean {
  try {
    return SUPPORTED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function resolveActiveChat(): Promise<ActiveChat> {
  let isSupported = false;
  let tabsSupported = false;
  try {
    const maybeTabs = (globalThis as unknown as { browser?: { tabs?: { query: (q: unknown) => Promise<{ id?: number; url?: string }[]> } } }).browser?.tabs;
    if (maybeTabs?.query) {
      const [tab] = await maybeTabs.query({ active: true, currentWindow: true });
      if (tab?.url) isSupported = isSupportedUrl(tab.url);
      tabsSupported = true;
      if (tab?.id != null) {
        try {
          const res = (await (globalThis as unknown as { browser: { tabs: { sendMessage: (id: number, msg: unknown) => Promise<unknown> } } }).browser.tabs.sendMessage(tab.id, { type: 'GET_CONVERSATION_KEY' })) as
            | { chatKey?: string | null; degraded?: boolean }
            | null
            | undefined;
          return { chatKey: res?.chatKey ?? null, degraded: Boolean(res?.degraded), isSupported };
        } catch {
          return { chatKey: null, degraded: false, isSupported };
        }
      }
    }
  } catch (err) {
    log.warn('failed to resolve active tab url', err);
  }
  // Fallback to background proxy (covers environments where tabs API unavailable in popup)
  if (!tabsSupported) {
    try {
      const res = (await browser.runtime.sendMessage({ type: 'GET_ACTIVE_CONVERSATION' })) as
        | { chatKey?: string | null; degraded?: boolean }
        | null
        | undefined;
      return { chatKey: res?.chatKey ?? null, degraded: Boolean(res?.degraded), isSupported };
    } catch (err) {
      log.warn('failed to resolve active conversation', err);
      return { chatKey: null, degraded: false, isSupported: false };
    }
  }
  return { chatKey: null, degraded: false, isSupported };
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

function hasAnyData(store: Store): boolean {
  for (const day of Object.values(store.days)) {
    for (const counters of Object.values(day)) {
      if (counters && counters.turns > 0) return true;
    }
  }
  for (const entry of Object.values(store.chats)) {
    if (entry.counters.turns > 0) return true;
  }
  return false;
}

function el(tag: keyof HTMLElementTagNameMap, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function scopeIcon(icon: ScopeIcon): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('scope-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const paths: Record<ScopeIcon, string> = {
    chat: 'M2.5 3.5h11v7h-6.6L4.2 13v-2.5H2.5z',
    today: 'M8 2.3v1.4M8 12.3v1.4M2.3 8h1.4M12.3 8h1.4M4 4l1 1M11 11l1 1M12 4l-1 1M5 11l-1 1M10.2 8A2.2 2.2 0 1 1 5.8 8a2.2 2.2 0 0 1 4.4 0Z',
    week: 'M2.5 3.5h11v10h-11zM2.5 6h11M5 2.5v2M11 2.5v2M5.3 8.5h1.2M8.7 8.5h2M5.3 11h1.2M8.7 11h2',
    month: 'M2.5 3.5h11v10h-11zM2.5 6h11M5 2.5v2M11 2.5v2M5.3 8.5h1.2M8 8.5h1.2M10.7 8.5h.1M5.3 11h1.2M8 11h1.2M10.7 11h.1',
  };
  path.setAttribute('d', paths[icon]);
  svg.appendChild(path);
  return svg;
}

function segmentedControl(active: Scope, onSelect: (scope: Scope) => void): HTMLElement {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Time scope');
  for (const { id, label, icon } of SCOPES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-btn';
    btn.append(scopeIcon(icon), document.createTextNode(label));
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

type SupportedProvider = { id: ProviderId; label: string; url: string };

const SUPPORTED_PROVIDERS: ReadonlyArray<SupportedProvider> = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/' },
];

function providerIcon(id: ProviderId): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('provider-icon', `provider-icon--${id}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'currentColor');
  // Source: Simple Icons (CC0) — accurate brand marks:
  // - ChatGPT uses OpenAI mark (simple-icons/openai.svg)
  // - Claude uses Anthropic Claude mark (simple-icons/claude.svg)
  // - Gemini uses Google Gemini mark (simple-icons/googlegemini.svg)
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const paths: Record<ProviderId, string> = {
    chatgpt:
      'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
    claude:
      'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z',
    gemini:
      'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
  };
  path.setAttribute('d', paths[id] ?? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z');
  svg.appendChild(path);
  return svg;
}

function supportedChatEmptyState(): HTMLElement {
  const wrap = el('div', 'empty empty--links');
  const message = el('p', 'empty-text');
  message.textContent = "Open a supported AI chat to see this conversation's water use.";
  wrap.appendChild(message);

  const list = el('ul', 'provider-links');
  list.setAttribute('role', 'list');
  for (const provider of SUPPORTED_PROVIDERS) {
    const li = el('li', 'provider-links-item');
    const a = document.createElement('a');
    a.className = 'provider-link';
    a.href = provider.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(providerIcon(provider.id), document.createTextNode(provider.label));
    const external = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    external.classList.add('provider-external');
    external.setAttribute('viewBox', '0 0 12 12');
    external.setAttribute('aria-hidden', 'true');
    external.setAttribute('focusable', 'false');
    external.setAttribute('fill', 'none');
    external.setAttribute('stroke', 'currentColor');
    external.setAttribute('stroke-width', '1.3');
    external.setAttribute('stroke-linecap', 'round');
    external.setAttribute('stroke-linejoin', 'round');
    const ep = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ep.setAttribute('d', 'M4.5 3.5h4v4M6.2 5.8 9 3M9 3v0');
    external.appendChild(ep);
    const ep2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ep2.setAttribute('d', 'M3 4.5V9a1 1 0 0 0 1 1h4.5');
    external.appendChild(ep2);
    a.appendChild(external);
    // Best-effort: use tabs API when available so links open in a new tab even from popup
    a.addEventListener('click', (e) => {
      const tabs = (globalThis as unknown as { browser?: { tabs?: { create?: (opts: { url: string }) => unknown } }; chrome?: { tabs?: { create?: (opts: { url: string }) => unknown } } }).browser?.tabs ?? (globalThis as unknown as { chrome?: { tabs?: { create?: (opts: { url: string }) => unknown } } }).chrome?.tabs;
      if (tabs?.create) {
        e.preventDefault();
        try { tabs.create({ url: provider.url }); window.close(); } catch { /* fallback to default */ }
      }
    });
    li.appendChild(a);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
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

function projectedNote(pace: PaceProjection): HTMLElement {
  const note = el('p', 'projected-note');
  const avgTurns = (pace.total.turns / pace.activeDays).toFixed(1).replace(/\.0$/, '');
  const dayLabel = pace.activeDays === 1 ? 'day' : 'days';
  note.textContent = `Projected · avg of ${pace.activeDays} ${dayLabel} (${pace.total.turns} total) · ${avgTurns}/day × ${pace.scope === 'week' ? '7' : '30'}`;
  note.title = pace.bandLabel;
  return note;
}

function appendView(body: HTMLElement, view: ScopeView, state: ScopesState, estimated?: PaceProjection | null): void {
  const reading = el('section', 'estimate-reading');
  if (estimated) reading.classList.add('is-estimated');
  body.appendChild(reading);

  if (view.primary.rung.image) {
    const image = document.createElement('img');
    image.className = 'comparison-image';
    image.src = view.primary.rung.image;
    image.alt = '';
    reading.classList.add('has-comparison-image');
    reading.appendChild(image);
  }

  const comparisonLabel = view.primary.label.replace(/^≈/, '');
  const [quantity = '', ...nameParts] = comparisonLabel.startsWith('less than one ')
    ? ['less than one', comparisonLabel.slice('less than one '.length)]
    : comparisonLabel.split(' ');
  const headline = el('p', 'headline');
  const quantityText = el('span', 'comparison-quantity');
  quantityText.textContent = quantity;
  headline.appendChild(quantityText);

  const details = el('div', 'comparison-details');
  const name = el('p', 'comparison-name');
  name.textContent = nameParts.join(' ');

  const low = formatVolume(view.band.low, state.units);
  const high = formatVolume(view.band.high, state.units);
  const subtitle = el('p', 'subtitle');
  subtitle.textContent = view.volumeLabel;
  subtitle.title = `${low} – ${high}`;
  if (estimated) {
    const est = document.createElement('span');
    est.className = 'subtitle-estimated';
    est.textContent = ' · estimated';
    est.title = `Estimated based on ${estimated.activeDays}-day avg (${estimated.total.turns} total)`;
    subtitle.appendChild(est);
    subtitle.title = `${low} – ${high} · estimated based on current usage (${estimated.activeDays}d avg)`;
  }

  const counters = view.counters;
  const providers = view.provider.map(providerLabel).join(', ');
  const meta = el('p', 'meta');
  if (counters) {
    meta.textContent = `${counters.turns} ${counters.turns === 1 ? 'response' : 'responses'} · ${providers}`;
  } else {
    meta.textContent = providers;
  }

  details.append(name, subtitle);
  reading.append(headline, details);

  reading.appendChild(meta);
}

/**
 * Pure-ish render: clears `container`, rebuilds the segmented control plus either a
 * ScopeView or an empty state. All inputs are passed in — the mutable `state` lives in
 * mountScopes; onSelectScope re-renders through it. No innerHTML, direct DOM only.
 * `pace` is a week/month projection derived from the average of collected days.
 * When pace exists (month data incomplete), it REPLACES the main reading.
 */
export function renderScopes(
  container: HTMLElement,
  view: ScopeView | null,
  state: ScopesState,
  onSelectScope: (scope: Scope) => void,
  pace: PaceProjection | null = null,
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
    if (state.scope === 'chat' && state.chatKey !== null) {
      body.appendChild(emptyState('Nothing tracked yet in this conversation.'));
    } else {
      body.appendChild(supportedChatEmptyState());
    }
    return;
  }

  // Month-gated projection: when pace exists we have <30 active days,
  // so replace the reading with the average-based projection.
  if (pace && (state.scope === 'week' || state.scope === 'month')) {
    appendView(body, pace.view, state, pace);
    body.appendChild(projectedNote(pace));
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
  let didInitScope = false;

  async function refresh(): Promise<void> {
    const seq = ++renderSeq;
    try {
      const [store, chat] = await Promise.all([repo.load(), resolveActiveChat()]);
      if (seq !== renderSeq) return;
      state.paused = !store.settings.tracking;
      state.units = store.settings.units;
      state.chatKey = chat.chatKey;
      state.degraded = chat.degraded;
      if (!didInitScope) {
        didInitScope = true;
        // Conditional default tab (must stay pure & testable via hasAnyData):
        // - no data → 'chat' (onboarding with provider links)
        // - in a chat window (supported host or known chatKey) → 'chat'
        // - otherwise → 'today'
        if (state.scope === 'today') {
          const hasData = hasAnyData(store);
          const isChatWindow = chat.isSupported || chat.chatKey !== null;
          if (!hasData || isChatWindow) state.scope = 'chat';
        }
      }
      let view: ScopeView | null;
      if (state.scope === 'chat') {
        const scan = await requestChatScan();
        if (seq !== renderSeq) return;
        view = scan ? buildScanView(scan, store.settings) : null;
      } else {
        view = buildScopeView(store, store.settings, state.scope, state.chatKey);
      }
      const pace = (state.scope === 'week' || state.scope === 'month') && !state.paused
        ? buildPaceProjection(store, store.settings, state.scope as 'week' | 'month', Date.now())
        : null;
      renderScopes(container, view, state, setScope, pace);
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
