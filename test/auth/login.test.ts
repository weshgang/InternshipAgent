import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { createVault } from '../../src/auth/vault.js';
import { login, authStats, type AuthDeps } from '../../src/auth/loginOrchestrator.js';
import { startFake, type Fake } from './fakeSite.js';

// Integration: headless Chrome of its own (never the student's profile) against a fake career site.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = !existsSync(CHROME) && 'Chrome not installed';
const PW = 'Old-Pa55word-xyz!';
let browser: Browser;
before(async () => { if (!skip) browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await browser?.close(); });

async function setup(users = { 'a@b.fr': PW }) {
  const site = await startFake({ ...users });
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const dir = mkdtempSync(join(tmpdir(), 'auth-'));
  const vault = createVault({ file: join(dir, 'v.enc.json'), key: randomBytes(32) });
  const notes: string[] = [];
  const deps: AuthDeps = { vault, email: 'a@b.fr', consent: {}, notify: async (m) => { notes.push(m); }, readEmail: async () => ({ error: 'no_email' }),
    runDir: join(dir, 'runs'), attemptsFile: join(dir, 'att.json'), metricsFile: join(dir, 'metrics.json'), pollMs: 200, humanTimeoutMs: 8000 };
  return { site, ctx, page, dir, vault, deps, notes, done: async () => { await ctx.close(); await site.close(); } };
}
const filesUnder = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? filesUnder(p) : [p]; }) : []);
const noSecretIn = (dir: string, secrets: string[]) => { for (const f of filesUnder(dir)) for (const s of secrets) assert.ok(!readFileSync(f, 'utf8').includes(s), `${s} leaked in ${f}`); };

test('1 existingSession', { skip }, async () => {
  const t = await setup(); const id = 'sess1'; t.site.sessions.add(id);
  await t.ctx.addCookies([{ name: 'sid', value: id, url: t.site.base }]);
  await t.page.goto(`${t.site.base}/login`);
  assert.equal((await login(t.page, t.deps)).method, 'existingSession'); await t.done();
});
test('2 ssoButton picks the account whose email is the student\'s', { skip }, async () => {
  const t = await setup(); await t.page.goto(`${t.site.base}/sso`);
  const r = await login(t.page, t.deps);
  assert.deepEqual([r.ok, r.method], [true, 'ssoButton']); assert.deepEqual(t.site.ssoPicked, ['a@b.fr']); await t.done();
});
test('3 vaultCredentials, and no secret in the run folder', { skip }, async () => {
  const t = await setup(); await t.vault.set(t.site.base, { username: 'a@b.fr', password: PW, created_by: 'student' });
  await t.page.goto(`${t.site.base}/login`);
  const r = await login(t.page, t.deps);
  assert.deepEqual([r.ok, r.method], [true, 'vaultCredentials']);
  assert.ok((await t.vault.get(t.site.base))?.last_used_at);
  assert.ok(filesUnder(t.deps.runDir!).length > 0); noSecretIn(t.deps.runDir!, [PW]); await t.done();
});
test('4 passwordReset only with consent; new password stored, notification sent', { skip }, async () => {
  const t = await setup(); t.deps.readEmail = async () => ({ link: t.site.inbox.at(-1)?.link });
  await t.page.goto(`${t.site.base}/login`);
  t.deps.consent = {}; // no consent -> falls to the student
  t.deps.humanTimeoutMs = 600; assert.equal((await login(t.page, t.deps)).method, 'askHuman'); assert.equal(t.site.inbox.length, 0);
  t.deps.consent = { reset_mot_de_passe: true }; t.deps.humanTimeoutMs = 8000; await t.page.goto(`${t.site.base}/login`);
  const r = await login(t.page, t.deps);
  assert.deepEqual([r.ok, r.method], [true, 'passwordReset']);
  const e = await t.vault.get(t.site.base); assert.ok(e && e.password !== PW && e.created_by === 'agent' && t.site.users['a@b.fr'] === e.password);
  assert.ok(t.notes.some((n) => n.includes('réinitialisé')));
  noSecretIn(t.deps.runDir!, [e!.password]); await t.done();
});
test('5 after 3 attempts today: straight to the student', { skip }, async () => {
  const t = await setup(); await t.vault.set(t.site.base, { username: 'a@b.fr', password: 'wrong-password-1', created_by: 'student' });
  t.deps.consent = { reset_mot_de_passe: true }; t.deps.humanTimeoutMs = 600;
  writeFileSync(t.deps.attemptsFile!, JSON.stringify({ [new URL(t.site.base).host]: { day: new Date().toISOString().slice(0, 10), n: 3 } }));
  await t.page.goto(`${t.site.base}/login`);
  assert.equal((await login(t.page, t.deps)).method, 'askHuman'); assert.equal(t.site.inbox.length, 0); await t.done();
});
test('6 captcha: student immediately, vault untouched; human login is detected by polling', { skip }, async () => {
  const t = await setup(); await t.vault.set(t.site.base, { username: 'a@b.fr', password: PW, created_by: 'student' });
  t.deps.notify = async (m) => { t.notes.push(m); setTimeout(() => t.page.goto(`${t.site.base}/account`).catch(() => {}), 100); t.site.sessions.add('h'); await t.ctx.addCookies([{ name: 'sid', value: 'h', url: t.site.base }]); };
  await t.page.goto(`${t.site.base}/captcha`);
  const r = await login(t.page, t.deps); assert.deepEqual([r.ok, r.method], [true, 'askHuman']);
  assert.ok(!existsSync(t.deps.attemptsFile!)); await t.done();
});
test('metrics: success rate per method', { skip }, async () => {
  const t = await setup(); await t.page.goto(`${t.site.base}/sso`); await login(t.page, t.deps);
  assert.deepEqual(authStats(t.deps.metricsFile)['method:ssoButton'], { tries: 1, ok: 1 }); await t.done();
});
test('7 no account and creation allowed: hand over to the sign-up flow once', { skip }, async () => {
  const t = await setup(); t.deps.consent = { creation_comptes_ats: true }; t.deps.signupTried = new Set();
  await t.page.goto(`${t.site.base}/login`);
  assert.equal((await login(t.page, t.deps)).method, 'needsSignup'); assert.ok(t.deps.signupTried.has(new URL(t.site.base).host)); await t.done();
});
test('8 never-used agent password: sign-up is retried with the SAME password (kept: the account may exist but not be activated yet), not a login loop', { skip }, async () => {
  const t = await setup(); t.deps.consent = { creation_comptes_ats: true }; t.deps.signupTried = new Set(); t.deps.escalate = true;
  await t.vault.set(t.site.base, { username: 'a@b.fr', password: 'never-registered-1', created_by: 'agent' });
  await t.page.goto(`${t.site.base}/login`);
  assert.equal((await login(t.page, t.deps)).method, 'needsSignup'); assert.equal((await t.vault.get(t.site.base))?.password, 'never-registered-1'); await t.done();
});
test('9 daily attempt budget used up: says so, never reports the credentials as rejected (nothing was tried)', { skip }, async () => {
  const t = await setup(); t.deps.escalate = true; t.deps.maxAttempts = 0;
  await t.vault.set(t.site.base, { username: 'a@b.fr', password: PW, created_by: 'agent' });
  await t.page.goto(`${t.site.base}/login`);
  const r = await login(t.page, t.deps);
  assert.notEqual(r.method, 'needsHelp'); assert.match(r.error ?? '', /tentatives|attempts/i); await t.done();
});
