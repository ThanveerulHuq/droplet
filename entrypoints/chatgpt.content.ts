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
    await refreshChatKey();
    // Task 13: SPA nav re-resolve — patch history.pushState + popstate -> refreshChatKey + re-baseline

    const teardown = adapter.observe(
      (sample) => {
        // Fire-and-forget: a closed channel (tab/popup gone) must not reject unhandled.
        void browser.runtime
          .sendMessage({ type: 'TURN_SAMPLE', sample: { ...sample, chatKey: currentChatKey } })
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

    browser.runtime.onMessage.addListener((msg: { type?: string }) => {
      if (msg.type === 'GET_CONVERSATION_KEY') return { chatKey: currentChatKey };
    });
  },
});
