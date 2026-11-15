import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// Brief 3.5/4: one generated password per site (Workday: one account per tenant host). Local file, never sent to the model.
const FILE = 'vault.json';
type Cred = { email: string; password: string; created_at: string };
const load = (): Record<string, Cred> => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {});
export const hasCreds = (host: string) => host in load();
export function credsFor(host: string, email: string): Cred {
  const v = load();
  if (!v[host]) {
    // shortcut: 'aA1!' guarantees the usual complexity rules; some sites forbid symbols, regenerate by hand then
    v[host] = { email, password: randomBytes(14).toString('base64url') + 'aA1!', created_at: new Date().toISOString() };
    writeFileSync(FILE, JSON.stringify(v, null, 1));
    chmodSync(FILE, 0o600);
  }
  return v[host];
}
