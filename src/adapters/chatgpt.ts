import { sha256Hex } from '../lib/hash.ts';
import { log } from '../lib/log.ts';
import type { SiteAdapter } from './types.ts';

// Selector sets are STARTING POINTS only — to be verified against the live DOM in
// Task 10 (completion detection). They are not guaranteed to match a deployed ChatGPT DOM.
const selectors = {
  sendButton: ['[data-testid="send-button"]', 'button[data-composer-submit]'],
  composer: ['#prompt-textarea', '[data-mobile-composer-prompt]'],
  userMessage: ['[data-message-author-role="user"]'],
  assistantMessage: ['[data-message-author-role="assistant"]'],
  // The classic send button doubles as the stop control while generating; some variants
  // surface a dedicated [data-testid="stop-button"].
  stopControl: ['[data-testid="stop-button"]'],
  // Reasoning UI is matched structurally (it lives inside an assistant message node).
  reasoning: ['[data-message-author-role="assistant"] [data-testid="reasoning-..."]'],
};

// Pure URL helpers live at module top level with no DOM access, so this module can be
// imported by the node test runner. `document`/`MutationObserver` are only touched at
// observe() call time, in content-script context.
export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  adapterVersion: '0.1.0',

  matches(url: URL): boolean {
    return (
      url.hostname === 'chatgpt.com' &&
      (/^\/g\/[^/]+\/c\//.test(url.pathname) || /^\/c\//.test(url.pathname))
    );
  },

  getConversationId(url: URL): string | null {
    if (url.hostname !== 'chatgpt.com') return null;
    // Trailing segment after the final /c/ in both /c/<uuid> and /g/<slug>/c/<uuid>.
    const m = url.pathname.match(/\/c\/([^/]+)$/i);
    return m ? (m[1] ?? null) : null;
  },

  selectors,

  observe(onTurn, opts): () => void {
    // Observation skeleton (Task 9): arms completion detection on submit and watches the
    // body for a NEW trailing assistant message. TurnSample emission is Task 10.
    void onTurn;
    void opts;
    const { sendButton, composer, assistantMessage } = selectors;

    let pending = false;
    let snapshot: HTMLElement | null = null;
    let currentElement: HTMLElement | null = null;
    let currentMessageId: string | null = null;

    // Identity (reference) of the last assistant message node — NOT the count, because
    // virtualized lists recycle nodes.
    const trailingAssistant = (): HTMLElement | null => {
      const nodes = document.querySelectorAll<HTMLElement>(assistantMessage.join(','));
      return nodes.length > 0 ? nodes.item(nodes.length - 1) : null;
    };

    const arm = (): void => {
      if (pending) return;
      snapshot = trailingAssistant();
      pending = true;
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
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!composer.some((sel) => target.closest(sel) !== null)) return;
      arm();
    };

    const onBodyMutation = (records: MutationRecord[]): void => {
      if (!pending) return;
      if (!records.some((r) => r.type === 'childList')) return;
      const current = trailingAssistant();
      if (current === snapshot) return;

      // A new trailing assistant message node appeared. Keep a handler-level reference to
      // the element + messageId so Task 10 can complete the turn; only the char-count
      // measurement of textContent happens later. messageId is a synthetic id, not prompt
      // or response text.
      const messageId = current?.getAttribute('data-message-id') ?? null;
      pending = false;
      currentElement = current;
      currentMessageId = messageId;
      log.info('assistant message detected', messageId);

      // Warm the turnKey derivation now; completion (Task 10) will hash and emit.
      void sha256Hex(messageId ?? '').then((digest) => {
        log.info('assistant message digest', digest);
      });
    };

    const observer = new MutationObserver(onBodyMutation);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onCaptureClick, true);
    document.addEventListener('keydown', onCaptureKeydown, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', onCaptureClick, true);
      document.removeEventListener('keydown', onCaptureKeydown, true);
      pending = false;
      snapshot = null;
      currentElement = null;
      currentMessageId = null;
    };
  },
};
