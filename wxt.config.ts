import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Build identifier for `manifest.version_name` (display-only, unlike the dotted-integer
// `version` field). Format: <version>+<sha> or <version>+<sha>+<buildTimestamp> when dirty.
function buildIdentifier(): string {
  const { version } = JSON.parse(readFileSync(path.resolve('package.json'), 'utf-8'));
  let sha = 'nogit';
  let dirty = false;
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
    dirty = execSync('git status --porcelain').toString().trim().length > 0;
  } catch {
    // Not in a git checkout — ship without a SHA.
  }
  if (!dirty) return `${version}+${sha}`;
  const builtAt = new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, 'Z');
  return `${version}+${sha}+${builtAt}`;
}

// `wxt zip` / `wxt zip -b firefox` both write to .output/; give each browser its own
// artifact filename so a Firefox build never overwrites the Chrome Web Store zip.
const targetBrowser = (() => {
  const i = process.argv.findIndex((arg) => arg === '-b' || arg === '--browser');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((arg) => arg.startsWith('--browser='));
  return eq ? eq.split('=')[1] : 'chrome';
})();

export default defineConfig({
  vite: () => ({
    build: { modulePreload: { polyfill: false } },
  }),
  zip: {
    name: targetBrowser === 'chrome' ? 'droplet-extension' : `droplet-extension-${targetBrowser}`,
    artifactTemplate: '{{name}}.zip',
  },
  hooks: {
    // entrypoints/mock.content.ts runs the real adapters against a local replica page
    // (added in a later milestone). Never ships — mirrors the reference WXT_MOCK gate.
    'entrypoints:found'(_wxt, infos) {
      if (process.env.WXT_MOCK !== '1') {
        const i = infos.findIndex((info) => info.name === 'mock');
        if (i !== -1) infos.splice(i, 1);
      }
    },
  },
  manifest: {
    name: 'Droplet: water used by your AI chats',
    description: 'Estimate the water used by your AI chat usage. No data collected, no network calls.',
    version_name: buildIdentifier(),
    permissions: ['storage', 'tabs'],
    host_permissions: ['https://chatgpt.com/*'],
    action: {
      default_popup: 'popup.html',
      default_icon: { '16': 'icons/16.png', '32': 'icons/32.png', '48': 'icons/48.png', '128': 'icons/128.png' },
    },
    ...(targetBrowser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'droplet@droplet.app', data_collection_permissions: { required: [], optional: [] } } } }
      : {}),
  },
});
