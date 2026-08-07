import test from 'node:test';
import assert from 'node:assert/strict';
import { chatgptAdapter } from '../src/adapters/chatgpt.ts';

// Pure URL/id helpers only — importing the module must not touch `document` (DOM globals
// are only referenced inside observe(), never at module top level).

const UUID = 'e6f3c2b8-4d5a-47c1-a3f9-2b8d1e7a4c61';

test('matches: true for /c/ and /g/<slug>/c/ conversation shapes', () => {
  assert.equal(chatgptAdapter.matches(new URL(`https://chatgpt.com/c/${UUID}`)), true);
  assert.equal(chatgptAdapter.matches(new URL(`https://chatgpt.com/c/abc`)), true);
  assert.equal(chatgptAdapter.matches(new URL(`https://chatgpt.com/g/foo/c/${UUID}`)), true);
  assert.equal(chatgptAdapter.matches(new URL('https://chatgpt.com/g/foo/c/abc')), true);
});

test('matches: false for non-conversation shapes and other hosts', () => {
  assert.equal(chatgptAdapter.matches(new URL('https://chatgpt.com/')), false);
  assert.equal(chatgptAdapter.matches(new URL('https://chatgpt.com/share/xyz')), false);
  assert.equal(chatgptAdapter.matches(new URL('https://example.com/c/abc')), false);
});

test('getConversationId: extracts the trailing uuid in both shapes', () => {
  assert.equal(chatgptAdapter.getConversationId(new URL(`https://chatgpt.com/c/${UUID}`)), UUID);
  assert.equal(
    chatgptAdapter.getConversationId(new URL(`https://chatgpt.com/g/foo/c/${UUID}`)),
    UUID,
  );
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/c/abc')), 'abc');
});

test('getConversationId: null for /, /share/, empty trailing segment, and other hosts', () => {
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/')), null);
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/share/xyz')), null);
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/c/')), null);
  assert.equal(chatgptAdapter.getConversationId(new URL('https://example.com/c/abc')), null);
});

// Edge: matches and getConversationId are independently defined; these lock the actual
// behavior of the current regexes so the matches↔id contract is documented.

test('edge: matches true for /c/<id>/<extra> but id extraction returns null', () => {
  // matches() accepts any /c/ prefix, but the id regex `/\/c\/([^/]+)$/` requires the id to
  // be a single trailing slash-free segment, so 'abc/xyz' has no capture → null.
  assert.equal(chatgptAdapter.matches(new URL('https://chatgpt.com/c/abc/xyz')), true);
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/c/abc/xyz')), null);
});

test('edge: /C/ABC is not matched (case-sensitive) but id extraction is case-insensitive', () => {
  // matches() uses the case-sensitive literal /^\/c\//, while the id regex has the /i flag.
  assert.equal(chatgptAdapter.matches(new URL('https://chatgpt.com/C/ABC')), false);
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/C/ABC')), 'ABC');
});
