import { repo } from '../src/storage/repo.ts';
import { applyTurn, type TurnSample } from '../src/storage/ingest.ts';
import { log } from '../src/lib/log.ts';

type IncomingMessage =
  | { type: 'TURN_SAMPLE'; sample: TurnSample }
  | { type: 'GET_MOCK_COUNTS' }
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
      void repo.load().then((store) => respond({ counts: store }));
      return true;
    }
  });
  void repo.load().then((store) => log.info('store loaded', store.meta));
});
