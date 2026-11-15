import { TOTP, Secret } from 'otpauth';
import type { VaultEntry } from './vault.js';

// The LLM only ever sees these tokens; real values are put in at typing time, after the LLM call.
export const TOKENS = { username: '{{vault.username}}', password: '{{vault.password}}', totp: '{{vault.totp}}' } as const;
const totpNow = (e: VaultEntry) => (e.totpSecret ? new TOTP({ secret: Secret.fromBase32(e.totpSecret.replace(/\s/g, '')) }).generate() : '');

// Called by fill(ref, value) right before typing.
export function resolve(value: string, e: VaultEntry): string {
  return value.replaceAll(TOKENS.username, e.username).replaceAll(TOKENS.password, e.password).replaceAll(TOKENS.totp, () => totpNow(e));
}

// Called on every snapshot before an LLM call: known secrets -> tokens, password fields -> hidden.
export function maskSnapshot(snapshot: string, entries: VaultEntry[] = []): string {
  let s = snapshot.split('\n').map((l) => (/(textbox|input)[^\n]*(password|mot de passe)/i.test(l) ? l.replace(/(\[ref=e\d+\]).*$/, '$1: [password field, value hidden]') : l)).join('\n');
  for (const e of entries) {
    if (e.password) s = s.replaceAll(e.password, TOKENS.password);
    const code = totpNow(e); if (code) s = s.replaceAll(code, TOKENS.totp);
  }
  return s;
}
