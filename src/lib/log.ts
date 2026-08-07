// Always-on production diagnostics (no dev-flag gate): lets testers report exactly what they
// see in DevTools (content script) or the service worker inspector (background) when
// troubleshooting "no counts appear" instead of guessing blind.
const PREFIX = '[Droplet]';

// Millisecond-precision wall-clock time so two log lines a few hundred ms apart can be told apart.
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export const log = {
  info: (...args: unknown[]) => console.log(PREFIX, timestamp(), ...args),
  warn: (...args: unknown[]) => console.warn(PREFIX, timestamp(), ...args),
};
