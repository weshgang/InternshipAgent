// Replace every known secret by *** in anything that is logged or written to runs/.
const MIN = 4; // shorter strings would mangle ordinary text
export const redact = (text: string, secrets: string[]) =>
  [...new Set(secrets)].filter((s) => s.length >= MIN).sort((a, b) => b.length - a.length).reduce((t, s) => t.replaceAll(s, '***'), text);

// Patch console so no log line can carry a secret.
export function installConsoleRedaction(getSecrets: () => string[]) {
  for (const m of ['log', 'info', 'warn', 'error'] as const) {
    const orig = console[m].bind(console);
    console[m] = (...a: unknown[]) => orig(...a.map((x) => (typeof x === 'string' ? redact(x, getSecrets()) : redact(JSON.stringify(x) ?? '', getSecrets()))));
  }
}

// Every file written under runs/ goes through this.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function safeWrite(path: string, text: string, secrets: string[]) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, redact(text, secrets)); }
