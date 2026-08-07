// SHA-256 of `input`, first `len` hex chars (default 16). PRD §8.2 turnKey / §9.3 convo id.
export async function sha256Hex(input: string, len = 16): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, len);
}
