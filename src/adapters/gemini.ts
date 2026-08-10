import { sha256Hex } from '../lib/hash.ts';
import { log } from '../lib/log.ts';
import type { ConversationScan, SiteAdapter } from './types.ts';

// Selectors ported from chatwait/entrypoints/content/adapters/gemini.ts (verified 2026-06-12).
// Gemini uses Angular custom elements — tag names stable. Only final model-response is
// measured (transient pending-request wrapper ignored per milestone scope).
const selectors = {
  sendButton: ['button[aria-label="Send message"]'],
  composer: ['rich-textarea [contenteditable]'],
  userMessage: ['user-query'],
  // Final assistant container — only this is counted
  assistantMessage: ['model-response'],
  // Stop control: send button disabled while generating (chatwait gemini done signal)
  stopControl: ['button[aria-label="Stop generating"]', 'button[aria-label="Stop response"]'],
  reasoning: [] as string[],
};

const QUIET_MS = 1200;
const STUCK_MS = 30_000;
const ASSISTANT_TIMEOUT_MS = 15_000;

export interface ScanNodeInput { length: number; hasReasoning: boolean; }

export function aggregateScan(nodes: ScanNodeInput[]): Omit<ConversationScan, 'provider'> | null {
  if (nodes.length === 0) return null;
  return {
    turnCount: nodes.length,
    totalChars: nodes.reduce((sum, n) => sum + n.length, 0),
    reasoningCount: nodes.filter((n) => n.hasReasoning).length,
  };
}

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  adapterVersion: '0.1.0',

  matches(url: URL): boolean {
    return url.hostname === 'gemini.google.com';
  },

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
    return agg ? { ...agg, provider: 'gemini' } : null;
  },

  observe(onTurn, opts): () => void {
    const { sendButton, composer, assistantMessage, stopControl } = selectors;
    const stopSelector = stopControl.join(',');
    const sendSelector = sendButton.join(',');

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

    // Gemini done = send button re-enabled. During generation either a stop button exists
    // or the send button is disabled. Use both signals for robustness.
    const stopControlActive = (): boolean => {
      if (document.querySelector(stopSelector) !== null) return true;
      const btn = document.querySelector<HTMLButtonElement>(sendSelector);
      if (btn && btn.disabled) return true;
      return false;
    };

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
        onTurn({ turnKey, charCount, isReasoning, provider: 'gemini' });
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
      pending = true;
      clearCycle();
      baseline = trailingAssistant();
      baselineId = baseline?.getAttribute('data-message-id') ?? baseline?.getAttribute('id') ?? null;
      scheduleAssistantTimeout();
      log.info('submit detected, awaiting new assistant message');
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
      const currentId = current?.getAttribute('data-message-id') ?? current?.getAttribute('id') ?? null;

      if (current === null) {
        if (active !== null) clearCycle();
        pending = false;
        assistantTimer = clearTimer(assistantTimer);
        return;
      }

      if (pending) {
        if (differs(current, currentId, baseline, baselineId)) startCycle(current, currentId);
        return;
      }

      if (active !== null) {
        if (differs(current, currentId, active, activeId)) {
          // Transient→permanent swap: trailing identity changed mid-cycle (only final
          // model-response counts, so re-baseline to the final container).
          startCycle(current, currentId);
          return;
        }
        if (mutationTouches(active, records)) {
          scheduleQuiet();
          scheduleStuck();
        }
        return;
      }

      if (lastEmitted !== null && differs(current, currentId, lastEmitted, lastEmittedId)) {
        startCycle(current, currentId);
      }
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
      pending = false;
      baseline = null;
      baselineId = null;
      active = null;
      activeId = null;
      lastEmitted = null;
      lastEmittedId = null;
    };
  },
};
