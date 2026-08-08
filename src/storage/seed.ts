import { emptyStore, type Store } from './schema.ts';
import { applyTurn } from './ingest.ts';

// QA/dev affordance (plan M2 exit): a deterministic-ish demo store so the popup's four
// scopes render distinct, non-zero figures without waiting for live tracking. Pure and
// browser-free — node tests import it directly.
//
//   turnsOnDay(offset) = 8 + (offset % 5)  → today=8, week≈70, month≈300, strictly increasing.
//   charCount cycles 1200 / -1 / 600 so estimated turns (median tokens) and reasoning turns
//   both appear; dedupe stays correct because every turnKey is unique per day+index.

const DAY_MS = 86_400_000;

export function seedDemoStore(now: number = Date.now(), activeChatKey: string | null = null): Store {
  const store = emptyStore();

  for (let offset = 0; offset < 30; offset++) {
    const dayNow = now - offset * DAY_MS;
    const turns = 8 + (offset % 5);
    for (let i = 0; i < turns; i++) {
      const charCount = i % 3 === 1 ? -1 : 1200;
      applyTurn(
        store,
        {
          turnKey: `seed-${offset}-${i}`,
          charCount,
          isReasoning: i % 3 === 0,
          provider: 'chatgpt',
          chatKey: activeChatKey ?? undefined,
        },
        dayNow,
      );
    }
  }

  return store;
}
