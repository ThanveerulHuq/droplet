// Dev-only mock harness, built only under WXT_MOCK=1. Registers the real chatgpt adapter
// against the localhost replica served by scripts/mock-server.mjs and drives it from the
// DevTools console via window.__dropletMock:
//
//   submitTurn(length, { reasoning })  script one assistant turn
//   reset()                            wipe the mock chat DOM (turn numbering keeps counting)
//   getCounts()                        read back the background store under the mock chat key
//
// Contract: one turn produces exactly ONE TURN_SAMPLE settling ~1.2s after streaming ends
// (charCount includes any reasoning text length; an empty turn still settles with charCount
// -1 via the stuck timer — see submitTurn). Port 5199 is hardcoded in BOTH
// scripts/mock-server.mjs and the matches[] below — intentional, keep the pair in sync.
import { chatgptAdapter } from '../src/adapters/chatgpt.ts';
import { registerAdapter, resolveAdapter } from '../src/adapters/registry.ts';
import { sha256Hex } from '../src/lib/hash.ts';
import { log } from '../src/lib/log.ts';
import { toDateKey } from '../src/storage/ingest.ts';
import type { Store } from '../src/storage/schema.ts';

// Content scripts can inject before parsing finishes; the adapter reads the DOM immediately,
// so wait for the document (mirrors the real chatgpt entrypoint).
async function whenDocumentLoaded(): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((r) => document.addEventListener('DOMContentLoaded', () => r(), { once: true }));
  }
}

// Turns are numbered monotonically across reset() calls: reset() clears the DOM but never
// rewinds the counter, so a re-submitted turn still gets a fresh data-message-id. Rewinding
// would re-hash the same turnKey, which applyTurn silently rejects as a duplicate dedupe.
let turnCount = 0;

interface MockApi {
  submitTurn(length: number, opts?: { reasoning?: boolean }): void;
  reset(): void;
  getCounts(): Promise<Store>;
}

export default defineContentScript({
  matches: ['http://localhost:5199/*'],
  async main() {
    await whenDocumentLoaded();

    // The real chatgpt adapter only matches chatgpt.com, so it refuses the localhost replica
    // URL. Register a thin localhost-only wrapper that delegates everything else (selectors,
    // observe, completion state machine) to the real adapter. This is the ONLY registration
    // site for now — a later task registers the adapter against the live site.
    registerAdapter({ ...chatgptAdapter, matches: (url: URL) => url.hostname === 'localhost' });
    const adapter = resolveAdapter(new URL(location.href));
    if (!adapter) return;
    log.info(`mock adapter ${adapter.id} v${adapter.adapterVersion} attached`);

    // The replica URL has no /c/<id> segment (getConversationId → null), so use a fixed mock
    // key. Turns still land in the real background → real storage.local, keyed under it.
    const mockKey = await sha256Hex('mock-conversation');
    log.info('mock chat key', mockKey);

    const teardown = adapter.observe(
      (sample) => {
        try {
          void browser.runtime
            .sendMessage({ type: 'TURN_SAMPLE', sample: { ...sample, chatKey: mockKey } })
            .catch(() => {});
        } catch (error) {
          log.warn('turn sample dropped — extension context invalidated (reload the mock tab)', error);
        }
      },
      { getConversationId: () => mockKey },
    );

    // Fidelity limits of the harness (documented, not fixed): the mock DOM only exercises a
    // slice of the adapter's real paths —
    //  - submits go through the send-button CLICK; the keydown-Enter composer path is never hit
    //  - nodes are never recycled and every assistant node carries a data-message-id, so the
    //    reference-compare branch of `differs` (the id-less fallback) is dead in the harness
    //  - alternate selectors (data-mobile-composer-prompt, button[data-composer-submit],
    //    aria-label="Stop generating") never match
    const chatlog = document.getElementById('chatlog');
    const composer = document.querySelector<HTMLTextAreaElement>('#prompt-textarea');
    const sendButton = document.querySelector<HTMLButtonElement>('[data-testid="send-button"]');
    const stopButton = (): HTMLButtonElement | null =>
      document.querySelector<HTMLButtonElement>('[data-testid="stop-button"]');

    // One turn must produce exactly ONE TURN_SAMPLE ~1.2s after streaming ends: the send-button
    // click arms the adapter (capture-phase submit), the new assistant element starts the
    // completion cycle, and every characterData mutation below re-baselines the adapter's 1200ms
    // quiet timer so it can never fire mid-stream. Stopping the mutation stream — and reverting
    // the stop control to the send state — lets the quiet window elapse and the turn settle.
    const submitTurn: MockApi['submitTurn'] = (length, opts) => {
      if (!chatlog || !composer || !sendButton) return;
      stopButton()?.remove();

      const text = 'x'.repeat(Math.max(0, Math.floor(length)));
      composer.value = `scripted turn #${turnCount + 1}`;

      // Real submit path: a capture-phase click listener arms the adapter (pending submit).
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      const user = document.createElement('div');
      user.setAttribute('data-message-author-role', 'user');
      user.textContent = composer.value;
      chatlog.appendChild(user);

      const stop = document.createElement('button');
      stop.type = 'button';
      stop.setAttribute('data-testid', 'stop-button'); // adapter's stop-control selector while generating
      stop.textContent = 'Stop generating';
      composer.parentElement?.appendChild(stop);

      const assistant = document.createElement('div');
      assistant.setAttribute('data-message-author-role', 'assistant');
      assistant.setAttribute('data-message-id', `mock-turn-${++turnCount}`);
      if (opts?.reasoning) {
        const reasoning = document.createElement('div');
        reasoning.setAttribute('data-testid', 'reasoning'); // adapter's reasoning selector
        reasoning.textContent = 'reasoning…';
        assistant.appendChild(reasoning);
      }
      const textNode = document.createTextNode('');
      assistant.appendChild(textNode);
      chatlog.appendChild(assistant);

      // Stream: mutate the text node's data every 100ms for ~300–800ms so the 1200ms quiet
      // window is re-baselined on every characterData mutation (R9.1). Once the text is fully
      // streamed, revert the stop control; completion settles ~1200ms after the last mutation.
      // submitTurn(0) streams no text, with two observable behaviors (no code change):
      //  - plain: the empty element never settles on the quiet window (each pass re-arms it),
      //    so completion only establishes on the 30s stuck timer, emitting charCount -1.
      //  - with { reasoning }: the reasoning div's text is counted, so the turn settles at the
      //    usual ~1.2s quiet window with charCount = reasoning text length.
      if (text.length === 0) {
        window.setTimeout(() => stop.remove(), 100);
        return;
      }
      const TICK_MS = 100;
      const ticks = Math.min(8, Math.max(3, Math.ceil(text.length / 40)));
      const chunk = Math.max(1, Math.ceil(text.length / ticks));
      let pos = 0;
      const stream = window.setInterval(() => {
        if (pos >= text.length) {
          window.clearInterval(stream);
          stop.remove();
          return;
        }
        const next = Math.min(pos + chunk, text.length);
        textNode.data += text.slice(pos, next);
        pos = next;
      }, TICK_MS);
    };

    const reset: MockApi['reset'] = () => {
      if (!chatlog) return;
      while (chatlog.firstChild) chatlog.removeChild(chatlog.firstChild);
      stopButton()?.remove();
      if (composer) composer.value = '';
      log.info('mock chat reset');
    };

    const getCounts: MockApi['getCounts'] = async () => {
      const res = (await browser.runtime.sendMessage({ type: 'GET_MOCK_COUNTS' })) as
        | { counts: Store }
        | undefined;
      if (!res) throw new Error('GET_MOCK_COUNTS returned no response');
      const day = toDateKey(Date.now());
      log.info('mock counts for today', day, res.counts.days[day]);
      return res.counts;
    };

    const api: MockApi = { submitTurn, reset, getCounts };
    // Expose the driver in the isolated world, and to the page console via an injected bridge
    // (postMessage round-trip), so a tester can drive turns from the DevTools page context.
    (window as unknown as { __dropletMock?: MockApi }).__dropletMock = api;

    const injectPageBridge = (): void => {
      const script = document.createElement('script');
      script.textContent = `(() => {
  if (window.__dropletMock) return;
  const pending = new Map();
  let seq = 0;
  const send = (method, args) => {
    const id = ++seq;
    window.postMessage({ __dropletMock: { id, method, args } }, '*');
    return new Promise((resolve) => pending.set(id, resolve));
  };
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.__dropletMockReply && pending.has(d.__dropletMockReply.id)) {
      pending.get(d.__dropletMockReply.id)(d.__dropletMockReply.value);
      pending.delete(d.__dropletMockReply.id);
    }
  });
  window.__dropletMock = {
    submitTurn: (length, opts) => send('submitTurn', [length, opts]),
    reset: () => send('reset', []),
    getCounts: () => send('getCounts', []),
  };
})();`;
      document.documentElement.appendChild(script);
      script.remove();
    };
    injectPageBridge();

    window.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { __dropletMock?: { id: number; method: string; args: unknown[] } } | null;
      const req = data && typeof data === 'object' ? data.__dropletMock : undefined;
      if (!req) return;
      // Always reply — success, not-found, or failure — so the page-side bridge's pending Map
      // never leaks an unresolved entry that would hang the caller's promise forever.
      const reply = (value: unknown): void =>
        window.postMessage({ __dropletMockReply: { id: req.id, value } }, '*');
      const fn = (api as unknown as Record<string, (...a: unknown[]) => unknown>)[req.method];
      if (typeof fn !== 'function') {
        reply({ error: `unknown mock method: ${req.method}` });
        return;
      }
      void Promise.resolve(fn(...req.args))
        .then(reply)
        .catch((err: unknown) => reply({ error: String(err) }));
    });

    void teardown;
  },
});
