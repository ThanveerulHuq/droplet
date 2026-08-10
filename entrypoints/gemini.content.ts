import { geminiAdapter } from '../src/adapters/gemini.ts';
import { registerAdapter, resolveAdapter } from '../src/adapters/registry.ts';
import { log } from '../src/lib/log.ts';

async function whenDocumentLoaded(): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((r) => document.addEventListener('DOMContentLoaded', () => r(), { once: true }));
  }
}

function listenForNavigation(onNavigate: () => void): () => void {
  const patch = (fn: typeof history.pushState) => {
    return function (this: History, ...args: Parameters<typeof fn>) {
      const result = fn.apply(this, args);
      onNavigate();
      return result;
    };
  };
  history.pushState = patch(history.pushState);
  history.replaceState = patch(history.replaceState);
  window.addEventListener('popstate', onNavigate);
  return () => {
    window.removeEventListener('popstate', onNavigate);
  };
}

export default defineContentScript({
  matches: ['https://gemini.google.com/*'],
  async main() {
    await whenDocumentLoaded();

    registerAdapter(geminiAdapter);
    const adapter = resolveAdapter(new URL(location.href));
    if (!adapter) return;
    log.info(`adapter ${adapter.id} v${adapter.adapterVersion} attached`);

    const currentChatKey: string | null = null;
    const refreshChatKey = async () => {
      log.info(`conversation key: none (chat-scoped disabled)`);
    };
    try {
      await refreshChatKey();
    } catch (err) {
      log.warn('failed to resolve conversation key', err);
    }

    const teardown = adapter.observe(
      (sample) => {
        try {
          void browser.runtime
            .sendMessage({ type: 'TURN_SAMPLE', sample: { ...sample, chatKey: undefined } })
            .catch(() => {});
        } catch (error) {
          log.warn('turn sample dropped — extension context invalidated (reload the gemini tab)', error);
        }
      },
      {
        getConversationId: () => currentChatKey,
        onDegraded: () => log.warn('adapter degraded — tracking may be incomplete'),
      },
    );

    const navTeardown = listenForNavigation(() => {
      void refreshChatKey();
    });

    const teardowns: Array<() => void> = [teardown, navTeardown];
    void teardowns;

    browser.runtime.onMessage.addListener((msg: { type?: string }) => {
      if (msg.type === 'GET_CONVERSATION_KEY') return Promise.resolve({ chatKey: currentChatKey });
      if (msg.type === 'SCAN_CONVERSATION') return Promise.resolve({ scan: adapter.scanConversation?.() ?? null });
    });
  },
});
