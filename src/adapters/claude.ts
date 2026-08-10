import { sha256Hex } from '../lib/hash.ts';
import { log } from '../lib/log.ts';
import type { ConversationScan, SiteAdapter } from './types.ts';

// Selectors ported from chatwait/entrypoints/content/adapters/claude.ts (verified 2026-06-12,
// re-verified 2026-08-06) for send/composer. Assistant/stop selectors adapt the same live DOM
// to Droplet's measurement model (textContent.length on completed assistant turns). This
// adapter intentionally measures only the final assistant container — no reasoning multiplier
// (per milestone scope).
const selectors = {
  sendButton: ['button[aria-label="Send message"]'],
  composer: ['[data-testid="chat-input"]'],
  userMessage: ['[data-testid="user-message"]'],
  // Assistant container: Claude renders streaming with [data-is-streaming] and stable testid
  // on completed turns. Fallback chain covers UI experiments (chatwait kept dual bubble
  // selectors for same reason).
  assistantMessage: ['[data-testid="assistant-message"]', '[data-is-streaming]'],
  // While streaming, body contains [data-is-streaming="true"]; fallback stop button covers
  // variants where a dedicated stop control is rendered.
  stopControl: ['[data-is-streaming="true"]', 'button[aria-label="Stop response"]', 'button[aria-label="Stop generating"]'],
  // No reasoning — milestone scope (isReasoning always false). Keep empty array so structural
  // query never matches; aggregateScan still returns reasoningCount 0.
  reasoning: [] as string[],
};

const QUIET_MS = 1200;
const STUCK_MS = 30_000;
const ASSISTANT_TIMEOUT_MS = 15_000;

// Claude history-load settling: on full page load or sidebar thread swap, history streams in
// incrementally and looks identical to a genuine append. Hold off anchoring while trailing
// keeps changing (port of chatwait settling logic).
const SETTLE_MS = 700;
const SUBMIT_CORROBORATION_MS = 1000;

export interface ScanNodeInput { length: number; hasReasoning: boolean; }

/** Pure aggregation: only lengths are inputs; only totals leave. */
export function aggregateScan(nodes: ScanNodeInput[]): Omit<ConversationScan, 'provider'> | null {
  if (nodes.length === 0) return null;
  return {
    turnCount: nodes.length,
    totalChars: nodes.reduce((sum, n) => sum + n.length, 0),
    reasoningCount: nodes.filter((n) => n.hasReasoning).length,
  };
}

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  adapterVersion: '0.1.0',

  matches(url: URL): boolean {
    return url.hostname === 'claude.ai';
  },

  // Chat-scoped estimates out of scope for this milestone — always null (day buckets only).
  getConversationId(_url: URL): string | null {
    return null;
  },

  selectors,

  scanConversation(): ConversationScan | null {
    const { assistantMessage } = selectors;
    const nodes = document.querySelectorAll<HTMLElement>(assistantMessage.join(','));
    const inputs: ScanNodeInput[] = [];
    for (const node of nodes) {
      inputs.push({
        length: node.textContent.length,
        hasReasoning: false,
      });
    }
    const agg = aggregateScan(inputs);
    return agg ? { ...agg, provider: 'claude' } : null;
  },

  observe(onTurn, opts): () => void {
    const { sendButton, composer, assistantMessage, stopControl } = selectors;
    const stopSelector = stopControl.join(',');

    let pending = false;
    let baseline: HTMLElement | null = null;
    let baselineId: string | null = null;
    let active: HTMLElement | null = null;
    let activeId: string | null = null;
    let lastEmitted: HTMLElement | null = null;
    let lastEmittedId: string | null = null;
    let degraded = false;
    let disposed = false;
    let quietTimer: number | null = null;
    let stuckTimer: number | null = null;
    let assistantTimer: number | null = null;
    let emitting = false;

    // Settling state (port of chatwait Claude)
    let settling = true;
    let settleTimer: number | null = null;
    let lastSubmitAt = 0;
    let pendingFirstMsg: HTMLElement | null = null;
    let pendingFirstMsgAt = 0;

    const trailingAssistant = (): HTMLElement | null => {
      const nodes = document.querySelectorAll<HTMLElement>(assistantMessage.join(','));
      return nodes.length > 0 ? nodes.item(nodes.length - 1) : null;
    };

    const differs = (
      a: HTMLElement | null,
      aId: string | null,
      b: HTMLElement | null,
      bId: string | null,
    ): boolean => {
      if (aId !== null && bId !== null) return aId !== bId;
      return a !== b;
    };

    const mutationTouches = (el: HTMLElement, records: MutationRecord[]): boolean =>
      records.some((r) => el.contains(r.target));

    const stopControlActive = (): boolean => document.querySelector(stopSelector) !== null;

    const clearTimer = (timer: number | null): null => {
      if (timer !== null) window.clearTimeout(timer);
      return null;
    };

    const clearTimers = (): void => {
      quietTimer = clearTimer(quietTimer);
      stuckTimer = clearTimer(stuckTimer);
      assistantTimer = clearTimer(assistantTimer);
    };

    const degrade = (): void => {
      if (degraded) return;
      degraded = true;
      opts.onDegraded?.();
    };

    const armSettle = (): void => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settling = false;
        settleTimer = null;
      }, SETTLE_MS);
    };

    // Initialize settling — suppress history-load false counts on entry
    const initial = trailingAssistant();
    // Seed lastEmitted so pre-existing history doesn't fire on its own (mirrors chatwait start)
    if (initial) {
      lastEmitted = initial;
      lastEmittedId = initial.getAttribute('data-message-id') ?? null;
    }
    armSettle();

    const scheduleQuiet = (): void => {
      quietTimer = clearTimer(quietTimer);
      quietTimer = window.setTimeout(onQuiet, QUIET_MS);
    };

    const scheduleStuck = (): void => {
      stuckTimer = clearTimer(stuckTimer);
      stuckTimer = window.setTimeout(onStuck, STUCK_MS);
    };

    const onQuiet = (): void => {
      quietTimer = null;
      if (disposed || active === null) return;
      if (stopControlActive()) return;
      if (active.textContent.length === 0) {
        scheduleQuiet();
        return;
      }
      void completeTurn(active, activeId);
    };

    const onStuck = (): void => {
      stuckTimer = null;
      if (disposed || active === null) return;
      if (stopControlActive()) {
        degrade();
        log.warn('completion never established; degraded');
        scheduleStuck();
        return;
      }
      void completeTurn(active, activeId);
    };

    const scheduleAssistantTimeout = (): void => {
      if (assistantTimer !== null) return;
      assistantTimer = window.setTimeout(() => {
        assistantTimer = null;
        if (pending) {
          degrade();
          log.warn('no assistant message appeared after submit; degraded');
        }
      }, ASSISTANT_TIMEOUT_MS);
    };

    const startCycle = (el: HTMLElement, id: string | null): void => {
      pending = false;
      assistantTimer = clearTimer(assistantTimer);
      active = el;
      activeId = id;
      scheduleQuiet();
      scheduleStuck();
      log.info('completion cycle started', id);
    };

    const clearCycle = (): void => {
      active = null;
      activeId = null;
      quietTimer = clearTimer(quietTimer);
      stuckTimer = clearTimer(stuckTimer);
    };

    const completeTurn = async (el: HTMLElement, id: string | null): Promise<void> => {
      if (emitting) return;
      emitting = true;
      let settled = false;
      try {
        const len = el.textContent.length;
        const charCount = len === 0 ? -1 : len;
        const isReasoning = false;
        const messageId = id ?? el.closest('[id]')?.getAttribute('id') ?? '';
        const turnKey = messageId === '' ? '' : await sha256Hex(messageId);
        if (disposed || active !== el) return;
        settled = true;
        onTurn({ turnKey, charCount, isReasoning, provider: 'claude' });
        log.info('turn sample emitted', { charCount, isReasoning, turnKey: turnKey.slice(0, 8) });
      } catch (error) {
        log.warn('onTurn threw; completion cycle cleared', error);
      } finally {
        emitting = false;
        if (settled) {
          lastEmitted = el;
          lastEmittedId = id;
          clearCycle();
        }
      }
    };

    const arm = (): void => {
      lastSubmitAt = Date.now();
      // If a first-msg was parked waiting for corroboration, treat that parked node as the
      // turn's assistant element (submit arrived after mutation, Tiptap ordering race).
      const pendingMsg = pendingFirstMsg;
      if (
        pendingMsg &&
        Date.now() - pendingFirstMsgAt < SUBMIT_CORROBORATION_MS &&
        pendingMsg === trailingAssistant()
      ) {
        pendingFirstMsg = null;
        if (!settling) {
          clearCycle();
          startCycle(pendingMsg, pendingMsg.getAttribute('data-message-id') ?? null);
          log.info('submit detected, pending first-msg corroborated');
          return;
        }
      }
      pending = true;
      clearCycle();
      baseline = trailingAssistant();
      baselineId = baseline?.getAttribute('data-message-id') ?? null;
      scheduleAssistantTimeout();
      log.info('submit detected, awaiting new assistant message');
    };

    const handlePendingFirst = (el: HTMLElement): void => {
      if (Date.now() - lastSubmitAt < SUBMIT_CORROBORATION_MS) {
        startCycle(el, el.getAttribute('data-message-id') ?? null);
      } else {
        pendingFirstMsg = el;
        pendingFirstMsgAt = Date.now();
        if (settleTimer !== null) window.clearTimeout(settleTimer);
        settling = true;
        armSettle();
      }
    };

    const onCaptureClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!sendButton.some((sel) => target.closest(sel) !== null)) return;
      arm();
    };

    const onCaptureKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      if (event.isComposing || event.repeat) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!composer.some((sel) => target.closest(sel) !== null)) return;
      arm();
    };

    const onBodyMutation = (records: MutationRecord[]): void => {
      if (disposed) return;
      if (!records.some((r) => r.type === 'childList' || r.type === 'characterData')) return;

      const current = trailingAssistant();
      const currentId = current?.getAttribute('data-message-id') ?? null;

      if (current === null) {
        if (active !== null) clearCycle();
        pending = false;
        assistantTimer = clearTimer(assistantTimer);
        return;
      }

      // Settling: suppress history-load appends
      if (settling) {
        const lastId = lastEmittedId;
        const isNew = differs(current, currentId, lastEmitted, lastId);
        if (isNew) {
          lastEmitted = current;
          lastEmittedId = currentId;
          armSettle();
        }
        return;
      }

      if (pending) {
        if (differs(current, currentId, baseline, baselineId)) startCycle(current, currentId);
        return;
      }

      if (active !== null) {
        if (differs(current, currentId, active, activeId)) {
          startCycle(current, currentId);
          return;
        }
        if (mutationTouches(active, records)) {
          scheduleQuiet();
          scheduleStuck();
        }
        return;
      }

      // Idle: decide if this is a real new turn vs history swap vs ambiguous first-msg
      const prior = lastEmitted;
      const priorId = lastEmittedId;
      if (!differs(current, currentId, prior, priorId)) return;

      // Unmounted prior => thread swap (sidebar nav)
      if (prior && !document.contains(prior)) {
        lastEmitted = current;
        lastEmittedId = currentId;
        settling = true;
        armSettle();
        return;
      }

      // No prior => ambiguous first-msg
      if (!prior) {
        lastEmitted = current;
        lastEmittedId = currentId;
        handlePendingFirst(current);
        return;
      }

      // Normal append
      pendingFirstMsg = null;
      startCycle(current, currentId);
    };

    const observer = new MutationObserver(onBodyMutation);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    document.addEventListener('click', onCaptureClick, true);
    document.addEventListener('keydown', onCaptureKeydown, true);

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('click', onCaptureClick, true);
      document.removeEventListener('keydown', onCaptureKeydown, true);
      clearTimers();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      pending = false;
      baseline = null;
      baselineId = null;
      active = null;
      activeId = null;
      lastEmitted = null;
      lastEmittedId = null;
      pendingFirstMsg = null;
    };
  },
};
