import { resolveAdapter } from '../src/adapters/registry.ts';
import { sha256Hex } from '../src/lib/hash.ts';
import { log } from '../src/lib/log.ts';

// Content scripts can inject before parsing finishes; the adapter reads the DOM immediately
// (and matches()/getConversationId() read location), so wait for the document (reference pattern).
async function whenDocumentLoaded(): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((r) => document.addEventListener('DOMContentLoaded', () => r(), { once: true }));
  }
}

// ChatGPT is an SPA: conversation-to-conversation navigation calls history.pushState /
// replaceState without a reload. Re-resolve the chat key on every navigation (R9.3).
function listenForNavigation(onNavigate: () => void): () => void {
  // Wrap pushState/replaceState: call onNavigate BEFORE the browser applies the state change
  // (capture-phase before hook) so the key is refreshed under the new URL.
  const patch = (fn: typeof history.pushState) => {
    return function (this: History, ...args: Parameters<typeof fn>) {
      onNavigate();
      return fn.apply(this, args);
    };
  };
  history.pushState = patch(history.pushState);
  history.replaceState = patch(history.replaceState);
  window.addEventListener('popstate', onNavigate);
  return () => {
    // NOTE: we can't reliably restore the original pushState (the reference doesn't either —
    // it leaves the wrapped versions in place); the teardown removes the popstate listener.
    window.removeEventListener('popstate', onNavigate);
  };
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  async main() {
    await whenDocumentLoaded();

    const adapter = resolveAdapter(new URL(location.href));
    if (!adapter) return;
    log.info(`adapter ${adapter.id} v${adapter.adapterVersion} attached`);

    let currentChatKey: string | null = null;
    const refreshChatKey = async () => {
      const id = adapter.getConversationId(new URL(location.href));
      currentChatKey = id ? await sha256Hex(id) : null;
      log.info(`conversation key: ${currentChatKey ?? 'none'}`);
    };
    try {
      await refreshChatKey();
    } catch (err) {
      // crypto.subtle can reject; don't let it silently kill tracking (WXT only logs in dev).
      log.warn('failed to resolve conversation key', err);
    }
    // Task 13: SPA nav re-resolve — patch history.pushState + popstate -> refreshChatKey + re-baseline

    const teardown = adapter.observe(
      (sample) => {
        // Fire-and-forget: a closed channel (tab/popup gone) must not reject unhandled.
        void browser.runtime
          .sendMessage({ type: 'TURN_SAMPLE', sample: { ...sample, chatKey: currentChatKey ?? undefined } })
          .catch(() => {});
      },
      {
        // types.ts promises getConversationId returns the raw conversation id, but here we hand
        // the adapter the already-hashed chatKey. The adapter never calls this callback today; the
        // asymmetry is intentional until a caller needs the raw id.
        getConversationId: () => currentChatKey,
        onDegraded: () => log.warn('adapter degraded — tracking may be incomplete'),
      },
    );

    // Re-resolve the key on SPA navigation. On a non-conversation URL (homepage, share page)
    // refreshChatKey yields null — the background treats that as "no conversation" (the day
    // still counts, but no chat bucket forms). Navigating into a conversation then re-resolves.
    const navTeardown = listenForNavigation(() => {
      void refreshChatKey();
    });

    // Seam for future clean-up (or a re-run): both teardowns live here so they can be invoked
    // together. The adapter's body MutationObserver re-attaches/re-baselines on DOM rebuilds
    // (Task 9/10's re-baseline design), so it picks up the new page's DOM without a nudge.
    const teardowns: Array<() => void> = [teardown, navTeardown];
    void teardowns;

    // A non-async listener returns a Promise ONLY for the matched type; an async listener
    // would return a Promise for every message and steal other listeners' responses. A plain
    // object return is dropped by Chrome/Firefox/polyfill runtimes, so the promise is required.
    browser.runtime.onMessage.addListener((msg: { type?: string }) => {
      if (msg.type === 'GET_CONVERSATION_KEY') return Promise.resolve({ chatKey: currentChatKey });
    });
  },
});
