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

// Contract: matches and getConversationId share one strict shape (single trailing segment
// after /c/, case-sensitive), so they never disagree. These lock that alignment.

test('edge: matches and getConversationId agree for /c/<id>/<extra> (no match, null)', () => {
  assert.equal(chatgptAdapter.matches(new URL('https://chatgpt.com/c/abc/xyz')), false);
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/c/abc/xyz')), null);
});

test('edge: /C/ABC is neither matched nor extracted (case-sensitive)', () => {
  assert.equal(chatgptAdapter.matches(new URL('https://chatgpt.com/C/ABC')), false);
  assert.equal(chatgptAdapter.getConversationId(new URL('https://chatgpt.com/C/ABC')), null);
});
