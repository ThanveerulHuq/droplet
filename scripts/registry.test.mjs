import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerAdapter, resolveAdapter } from '../src/adapters/registry.ts';

// Registry is module-level shared state, so the stub is registered once at module
// top level (outside any test) to keep tests robust to ordering.
const stubAdapter = {
  id: 'chatgpt',
  matches: (u) => u.hostname === 'chatgpt.com' && /^\/(c|g)\//.test(u.pathname),
  getConversationId: (u) => {
    const m = u.pathname.match(/^\/(c|g)\/([^/]+)/);
    return m ? m[1] : null;
  },
  observe: () => () => {},
  selectors: { sendButton: [], composer: [], userMessage: [], assistantMessage: [], stopControl: [], reasoning: [] },
  adapterVersion: '0.0.0-test',
};
registerAdapter(stubAdapter);

test('resolveAdapter returns the chatgpt adapter for a chatgpt.com conversation URL', () => {
  const adapter = resolveAdapter(new URL('https://chatgpt.com/c/abc123'));
  assert.ok(adapter);
  assert.equal(adapter.id, 'chatgpt');
  assert.equal(adapter.adapterVersion, '0.0.0-test');
});

test('resolveAdapter returns null for a non-matching host', () => {
  assert.equal(resolveAdapter(new URL('https://example.com/')), null);
});

// The live content script is the ONLY registration site for the real chatgpt adapter on
// chatgpt.com (mock.content.ts registers a localhost-only wrapper, never the real one).
// If this registration is ever removed, resolveAdapter returns null on the live site and
// tracking silently dies (2026-08-08 incident: popup "This chat" could not auto-detect).
test('chatgpt.content.ts registers the live chatgpt adapter before resolving', () => {
  const src = readFileSync(new URL('../entrypoints/chatgpt.content.ts', import.meta.url), 'utf8');
  assert.ok(
    src.includes('registerAdapter(chatgptAdapter)'),
    'entrypoints/chatgpt.content.ts must call registerAdapter(chatgptAdapter)',
  );
  const resolveIdx = src.indexOf('resolveAdapter(new URL(location.href))');
  const registerIdx = src.indexOf('registerAdapter(chatgptAdapter)');
  assert.ok(
    registerIdx !== -1 && resolveIdx !== -1 && registerIdx < resolveIdx,
    'registration must happen before resolveAdapter in chatgpt.content.ts',
  );
});
