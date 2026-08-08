import { sha256Hex } from '../lib/hash.ts';
import { log } from '../lib/log.ts';
import type { ConversationScan, SiteAdapter } from './types.ts';

// Selectors were VERIFIED against the live signed-in ChatGPT DOM on 2026-08-08: every
// selector below matched exactly the intended nodes (send button, composer, assistant
// message role, stop button, reasoning testid). Re-check when ChatGPT changes its DOM.
const selectors = {
  sendButton: ['[data-testid="send-button"]', 'button[data-composer-submit]'],
  composer: ['#prompt-textarea', '[data-mobile-composer-prompt]'],
  userMessage: ['[data-message-author-role="user"]'],
  assistantMessage: ['[data-message-author-role="assistant"]'],
  // The classic send button doubles as the stop control while generating; newer variants
  // surface a dedicated stop button. When none matches on a DOM variant, the quiet debounce
  // alone guards against mid-stream counting.
  stopControl: ['[data-testid="stop-button"]', 'button[aria-label="Stop generating"]'],
  // Reasoning UI is matched structurally, scoped inside an assistant message node.
  // VERIFIED 2026-08-08 on the live signed-in DOM.
  reasoning: ['[data-message-author-role="assistant"] [data-testid="reasoning"]'],
};

// Detection tuning (PRD R9.1/R9.4). Reasoned starting points, re-tuned against the Task 14
// mock harness and live verification.
const QUIET_MS = 1200; // completion requires the assistant element unchanged this long
const STUCK_MS = 30_000; // no completion progress for this long ⇒ completion never establishes
const ASSISTANT_TIMEOUT_MS = 15_000; // a submit must yield a new assistant element within this

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

// Pure URL helpers live at module top level with no DOM access, so this module can be
// imported by the node test runner. `document`/`MutationObserver` are only touched at
// observe() call time, in content-script context.
export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  adapterVersion: '0.1.0',

  // matches and getConversationId share one strict shape: exactly one trailing segment
  // after /c/ (case-sensitive), so they can never disagree on a URL.
  matches(url: URL): boolean {
    return (
      url.hostname === 'chatgpt.com' &&
      (/^\/g\/[^/]+\/c\/[^/]+$/.test(url.pathname) || /^\/c\/[^/]+$/.test(url.pathname))
    );
  },

  getConversationId(url: URL): string | null {
    if (url.hostname !== 'chatgpt.com') return null;
    // Trailing segment after the final /c/ in both /c/<uuid> and /g/<slug>/c/<uuid>.
    const m = url.pathname.match(/\/c\/([^/]+)$/);
    return m ? (m[1] ?? null) : null;
  },

  selectors,

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

  observe(onTurn, opts): () => void {
    const { sendButton, composer, assistantMessage, stopControl, reasoning } = selectors;
    const reasoningSelector = reasoning.join(',');
    const stopSelector = stopControl.join(',');

    // Completion state machine (R9.1): IDLE → submit → AWAITING → new assistant element →
    // CYCLE → stop reverted + 1200 ms quiet → EMIT → IDLE. While in CYCLE, every mutation
    // that changes the trailing assistant element re-baselines the quiet/stuck clocks
    // ("never count mid-stream"), and a trailing-element identity change re-baselines the
    // whole cycle (streaming placeholder → final container swap, regeneration, rapid submits).
    // Completion needs the stop control to have reverted to the send state (fresh DOM read
    // at settle time) AND the element unchanged for QUIET_MS.
    let pending = false; // a submit was detected, its assistant element not seen yet
    let baseline: HTMLElement | null = null; // trailing element at submit time
    let baselineId: string | null = null;
    let active: HTMLElement | null = null; // element under a completion cycle
    let activeId: string | null = null;
    let lastEmitted: HTMLElement | null = null; // identity anchor after a completed turn
    let lastEmittedId: string | null = null;
    let degraded = false; // onDegraded fired at most once per observe (R9.4)
    let disposed = false;
    let quietTimer: number | null = null;
    let stuckTimer: number | null = null;
    let assistantTimer: number | null = null;
    let emitting = false; // a completeTurn is in flight; ignore concurrent settles

    // Identity of the last assistant message node — NOT the count, because virtualized
    // lists recycle nodes.
    const trailingAssistant = (): HTMLElement | null => {
      const nodes = document.querySelectorAll<HTMLElement>(assistantMessage.join(','));
      return nodes.length > 0 ? nodes.item(nodes.length - 1) : null;
    };

    // Node identity: when both nodes carry a known data-message-id, the id is authoritative
    // (same id = same turn regardless of reference); otherwise fall back to reference
    // comparison (Task 9 hardening).
    const differs = (
      a: HTMLElement | null,
      aId: string | null,
      b: HTMLElement | null,
      bId: string | null,
    ): boolean => {
      // Compare ids FIRST when both are known: equal ids are the same turn even if the
      // reference changed. Virtualized scrollback evicts and re-inserts the trailing node,
      // and wholesale re-renders (theme change, message edit) swap references while keeping
      // ids — reference-first comparison would double-count an already-emitted turn (M1:
      // scroll back into history → count unchanged). Different ids still catch regeneration
      // (new data-message-id) and rapid submits.
      if (aId !== null && bId !== null) return aId !== bId;
      // At least one id unknown/missing: fall back to reference comparison. Equal references
      // are the same turn; different references (recycled node, regeneration) are new.
      return a !== b;
    };

    // Did any record mutate inside the tracked element (streaming content into it)?
    // `Node.contains` accepts text-node targets, so characterData streaming (React mutating
    // an existing text node's nodeValue) still counts as touching the element.
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
      if (stopControlActive()) return; // stop control still up — not reverted to send state
      if (active.textContent.length === 0) {
        // Empty at settle time: either a content-less turn or the first token hasn't landed
        // yet. Wait one more quiet window rather than emit a premature -1 (R6.5) mid-stream.
        scheduleQuiet();
        return;
      }
      void completeTurn(active, activeId);
    };

    const onStuck = (): void => {
      stuckTimer = null;
      if (disposed || active === null) return;
      if (stopControlActive()) {
        // No progress for STUCK_MS and the stop control never reverted: completion can never
        // establish (R9.4). Keep the cycle alive so a slow-but-valid turn is still counted —
        // re-arm the stuck clock so a later manual stop (revert) still settles the turn; a
        // frozen stream left alone must not dead-end the cycle.
        degrade();
        log.warn('completion never established; degraded');
        scheduleStuck();
        return;
      }
      // Stop reverted; the element stayed quiet (and possibly empty) this whole time. Settle
      // the turn now — completeTurn emits charCount -1 for an empty element (R6.5).
      void completeTurn(active, activeId);
    };

    const scheduleAssistantTimeout = (): void => {
      if (assistantTimer !== null) return;
      assistantTimer = window.setTimeout(() => {
        assistantTimer = null;
        // A submit fired but no assistant element appeared in time: the assistant selector
        // never matches this DOM (R9.4).
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
      // Guard against a concurrent settle re-entering while a hash is in flight: a mutation
      // could re-base quiet mid-await and fire a second completeTurn for the same turn.
      if (emitting) return;
      emitting = true;
      let settled = false; // guard passed; this call owns the sample
      try {
        // Privacy rule: `.textContent` is read exactly once, only for its `.length`; only the
        // length survives the function call. Nothing else is read, buffered, or stored.
        const len = el.textContent.length;
        const charCount = len === 0 ? -1 : len;
        const isReasoning = el.querySelector(reasoningSelector) !== null; // structural only
        // messageId chain: data-message-id → nearest [id] (self or ancestor) → ''. The final
        // '' turnKey disables dedupe for that turn; hashing response text is deliberately NOT
        // used as a fallback (privacy constraint).
        const messageId = id ?? el.closest('[id]')?.getAttribute('id') ?? '';
        const turnKey = messageId === '' ? '' : await sha256Hex(messageId);
        if (disposed || active !== el) return; // cycle re-baselined or torn down mid-hash
        settled = true;
        onTurn({ turnKey, charCount, isReasoning, provider: 'chatgpt' });
        log.info('turn sample emitted', { charCount, isReasoning, turnKey: turnKey.slice(0, 8) });
      } catch (error) {
        // A throwing onTurn must not leave the cycle armed or reject unhandled.
        log.warn('onTurn threw; completion cycle cleared', error);
      } finally {
        emitting = false;
        if (settled) {
          // Anchor the emitted element even if onTurn threw, so the idle branch never re-cycles
          // the same element, and always clear the cycle so the next submit starts clean. If
          // the cycle was re-baselined mid-hash (settled false), the new cycle owns the timers.
          lastEmitted = el;
          lastEmittedId = id;
          clearCycle();
        }
      }
    };

    // Re-snapshot on EVERY submit — no early return (self-healing): virtualized lists
    // recycle nodes, and a stale baseline would blind detection forever.
    const arm = (): void => {
      pending = true;
      clearCycle();
      baseline = trailingAssistant();
      baselineId = baseline?.getAttribute('data-message-id') ?? null;
      scheduleAssistantTimeout();
      log.info('submit detected, awaiting new assistant message');
    };

    // Capture-phase so this runs before the page's own handlers.
    const onCaptureClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!sendButton.some((sel) => target.closest(sel) !== null)) return;
      arm();
    };

    const onCaptureKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      // Ignore IME composition confirms and held-down key auto-repeat: both would falsely
      // arm a submit that never actually fired.
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
        // No assistant node in the DOM (chat cleared / navigation): abandon any cycle and
        // cancel the pending submit, so the stale 15s assistant deadline can't fire a false
        // degrade() against the cleared chat.
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
          // Trailing identity changed mid-cycle (streaming placeholder → final container
          // swap, regeneration, rapid submit): re-baseline the whole completion cycle.
          startCycle(current, currentId);
          return;
        }
        if (mutationTouches(active, records)) {
          // Still streaming into the tracked element: re-baseline quiet + stuck clocks so a
          // mid-stream pause is never counted (R9.1).
          scheduleQuiet();
          scheduleStuck();
        }
        return;
      }

      // Idle after a completed turn: a trailing identity change (e.g. a regeneration with a
      // new data-message-id) starts a fresh cycle.
      if (lastEmitted !== null && differs(current, currentId, lastEmitted, lastEmittedId)) {
        startCycle(current, currentId);
      }
    };

    const observer = new MutationObserver(onBodyMutation);
    // characterData: React often streams tokens by mutating an existing text node's
    // nodeValue, which fires a characterData record rather than a childList one.
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
