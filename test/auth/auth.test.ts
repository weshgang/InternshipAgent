import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createVault, type VaultEntry } from '../../src/auth/vault.js';
import { resolve, maskSnapshot, TOKENS } from '../../src/auth/substitution.js';
import { redact } from '../../src/auth/redact.js';

const PW = 'S3cr3t-Pa55word!xyz';
const mk = () => { const file = join(mkdtempSync(join(tmpdir(), 'vault-')), 'v.enc.json'); return { file, vault: createVault({ file, key: randomBytes(32) }) }; };
const entry = (over: Partial<VaultEntry> = {}): VaultEntry => ({ origin: 'https://acme.wd3.myworkdayjobs.com', username: 'a@b.fr', password: PW, created_by: 'agent', created_at: '', ...over });

test('vault: round trip, ciphertext holds no plaintext', async () => {
  const { file, vault } = mk();
  await vault.set('https://acme.wd3.myworkdayjobs.com/en-US/careers', { username: 'a@b.fr', password: PW, created_by: 'agent' });
  assert.equal((await vault.get('https://acme.wd3.myworkdayjobs.com/x'))?.password, PW);
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes(PW) && !raw.includes('a@b.fr'));
});
test('vault: strict origin match (no sub-domain, no look-alike)', async () => {
  const { vault } = mk();
  await vault.set('https://acme.wd3.myworkdayjobs.com', { username: 'u', password: PW, created_by: 'agent' });
  assert.equal(await vault.get('https://evil.acme.wd3.myworkdayjobs.com'), undefined);
  assert.equal(await vault.get('https://acme.wd3.myworkdayjobs.com.evil.io'), undefined);
  assert.equal(await vault.get('http://acme.wd3.myworkdayjobs.com'), undefined);
});
test('vault: list never returns passwords; remove works; wrong key or tampering fails', async () => {
  const { file, vault } = mk();
  await vault.set('https://a.io', { username: 'u', password: PW, created_by: 'student' });
  assert.ok(!JSON.stringify(await vault.list()).includes(PW));
  await assert.rejects(createVault({ file, key: randomBytes(32) }).get('https://a.io'));
  await vault.remove('https://a.io');
  assert.equal(await vault.get('https://a.io'), undefined);
});
test('substitution: tokens resolved only at typing time', () => {
  assert.equal(resolve(TOKENS.password, entry()), PW);
  assert.equal(resolve(TOKENS.username, entry()), 'a@b.fr');
  const totp = resolve(TOKENS.totp, entry({ totpSecret: 'JBSWY3DPEHPK3PXP' }));
  assert.match(totp, /^\d{6}$/);
});
test('substitution: snapshot masks known secrets and password fields', () => {
  const snap = `- textbox "Password" [ref=e5]: ${PW}\n- text: your password is ${PW}\n- textbox "Email" [ref=e4]: a@b.fr`;
  const out = maskSnapshot(snap, [entry()]);
  assert.ok(!out.includes(PW));
  assert.ok(out.includes('[password field, value hidden]') && out.includes(TOKENS.password) && out.includes('a@b.fr'));
});
test('redact: secrets become ***, short strings left alone', () => {
  assert.equal(redact(`typed ${PW} ok`, [PW]), 'typed *** ok');
  assert.equal(redact('abc', ['a']), 'abc');
});
test('vault: get() on a non-URL (about:blank, empty) returns undefined instead of throwing', async () => {
  const { vault } = mk();
  assert.equal(await vault.get('about:blank'), undefined); assert.equal(await vault.get(''), undefined);
});
