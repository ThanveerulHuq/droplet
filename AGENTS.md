# Droplet — agent guidelines

- This repo is MIT licensed.
- Content scripts must never read, buffer, or store prompt or response text — the only measurement allowed is `.textContent.length` (char count), and only the length survives the function call.
- Keep console diagnostics in `src/lib/log.ts` always-on (no dev-flag gate).
- Pure functions live in `src/model/` and `src/storage/ingest.ts` so node tests can import them via `--experimental-strip-types`.
- No network calls of any kind are permitted anywhere in the extension code (enforced later by `assert-no-network`).
