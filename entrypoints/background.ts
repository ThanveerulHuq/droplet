import { repo } from '../src/storage/repo.ts';
import { applyTurn, type TurnSample } from '../src/storage/ingest.ts';
import { log } from '../src/lib/log.ts';

type IncomingMessage =
  | { type: 'TURN_SAMPLE'; sample: TurnSample }
  | { type: 'GET_MOCK_COUNTS' }
  | { type: 'GET_ACTIVE_CONVERSATION' }
  | { type?: string };

let queue: Promise<void> = Promise.resolve();

export default defineBackground(() => {
  log.info('build', browser.runtime.getManifest().version_name);
  browser.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse) => {
    // If the sender's channel is closed (popup/tab gone), sendResponse throws; never let that
    // reject the serialized queue or wedge every subsequent message.
    const respond = (value: unknown) => { try { sendResponse(value); } catch { /* channel closed */ } };
    if (message.type === 'TURN_SAMPLE' && 'sample' in message) {
      // Serialized across tabs: two concurrent reads of the same store must never both
      // increment from the same snapshot (R9.7). Mirrors the reference's enqueueAdSelection.
      queue = queue
        .then(() => repo.load())
        .then(async (store) => {
          const { store: next, accepted } = applyTurn(store, message.sample);
          if (accepted) await repo.save(next);
          return accepted;
        })
        .then((accepted) => respond({ accepted }))
        .catch((err) => { log.warn('TURN_SAMPLE failed', err); respond({ accepted: false }); });
      return true;
    }
    if (message.type === 'GET_MOCK_COUNTS') {
      // Mock-only: the WXT_MOCK content script reads back the store to assert scripted turns.
      // Harmless on real builds — no other sender uses this type.
      void repo
        .load()
        .then((store) => respond({ counts: store }))
        .catch((err) => {
          log.warn('GET_MOCK_COUNTS failed', err);
          respond({ counts: null });
        });
      return true;
    }
    if (message.type === 'GET_ACTIVE_CONVERSATION') {
      // Popup scopes: the 'chat' scope needs the active tab's conversation key. The tab's
      // content script answers GET_CONVERSATION_KEY; the degraded flag is filled in by a later
      // task (the content script currently replies `{ chatKey }` only, so default it to false).
      void (async () => {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) { respond({ chatKey: null, degraded: false }); return; }
          try {
            const res = (await browser.tabs.sendMessage(tab.id, { type: 'GET_CONVERSATION_KEY' })) as
              | { chatKey?: string | null }
              | null
              | undefined;
            respond({ chatKey: res?.chatKey ?? null, degraded: false });
          } catch {
            respond({ chatKey: null, degraded: false }); // tab not running a content script
          }
        } catch (err) {
          log.warn('GET_ACTIVE_CONVERSATION failed', err);
          respond({ chatKey: null, degraded: false });
        }
      })();
      return true;
    }
  });
  void repo.load().then((store) => log.info('store loaded', store.meta));
});
