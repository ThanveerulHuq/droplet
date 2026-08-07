import test from 'node:test';
import assert from 'node:assert/strict';
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
