import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Page } from 'playwright-core';
import { detectLogin, detectLoginHtml, loginFields, type LoginInfo } from './detectLogin.js';
import { TOKENS, resolve } from './substitution.js';
import { redact, safeWrite } from './redact.js';
import { resetPassword } from './passwordReset.js';
import type { createVault } from './vault.js';
import type { CareerAccountDecision } from './careerAccounts.js';

export type AuthMethod = 'needsHelp' | 'existingSession' | 'ssoButton' | 'browserAutofill' | 'vaultCredentials' | 'passwordReset' | 'askHuman' | 'needsSignup' | 'noLoginNeeded';
export type LoginResult = { ok: boolean; method: AuthMethod; error?: string };
export type AuthDeps = {
  vault: ReturnType<typeof createVault>; email: string; local?: boolean;
  consent: { reset_mot_de_passe?: boolean; creation_comptes_ats?: boolean };
  readEmail: (hint: string) => Promise<{ code?: string; link?: string; error?: string }>;
  notify: (msg: string) => Promise<void> | void; // tells the student; never blocks
  signupTried?: Set<string>; escalate?: boolean; // escalate: when saved credentials fail, return the page's error to the caller (the model diagnoses) instead of waiting for the student
  careerSite?: boolean;
  accountDecision?: (host: string, email: string) => Promise<CareerAccountDecision | undefined>;
  runDir?: string; attemptsFile?: string; metricsFile?: string; pollMs?: number; humanTimeoutMs?: number; maxAttempts?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const readJson = <T,>(f: string, fallback: T): T => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback);
const writeJson = (f: string, v: unknown) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1)); };

const probe = async (p: Page): Promise<LoginInfo> => { try { return detectLoginHtml(await p.content(), p.url()); } catch { return { isLogin: true, isSignup: false, ssoProviders: [], captcha: false, loggedInMarker: false, uncertain: false }; } };
async function waitNotLogin(p: Page, ms: number, every = 400) { for (let t = 0; t < ms; t += every) { await sleep(every); if (!(await probe(p)).isLogin) return true; } return false; }

export async function login(page: Page, d: AuthDeps): Promise<LoginResult> {
  const host = new URL(page.url()).host, origin = new URL(page.url()).origin;
  const steps: string[] = [];
  const say = async (m: string) => { const line = redact(`[auth ${host}] ${m}`, await d.vault.secrets()); steps.push(line); console.log(line); };
  const finish = async (r: LoginResult) => {
    if (!['noLoginNeeded', 'needsSignup'].includes(r.method)) { // metrics per method and domain
      const f = d.metricsFile ?? 'runs/auth-metrics.json';
      writeJson(f, [...readJson<unknown[]>(f, []), { domain: host, method: r.method, ok: r.ok, at: new Date().toISOString() }]);
    }
    if (d.runDir) safeWrite(`${d.runDir}/auth-log.txt`, steps.join('\n'), await d.vault.secrets());
    return r;
  };
  const budget = () => { // max 3 login attempts per domain per day
    const f = d.attemptsFile ?? 'data/login-attempts.json'; const all = readJson<Record<string, { day: string; n: number }>>(f, {});
    const cur = all[host]?.day === today() ? all[host] : { day: today(), n: 0 };
    if (cur.n >= (d.maxAttempts ?? 3)) return false;
    all[host] = { day: cur.day, n: cur.n + 1 }; writeJson(f, all); return true;
  };

  let info = await probe(page);
  if (!info.isLogin) return finish({ ok: true, method: info.loggedInMarker ? 'existingSession' : 'noLoginNeeded' });
  // NOTE: no screenshot is taken and nothing goes to the LLM during this whole function.

  if (info.captcha) { await say('captcha: asking the student'); return finish(await askHuman()); }

  // 1. existing session: the site may still be redirecting
  if (await waitNotLogin(page, 1200)) { await say('existing session'); return finish({ ok: true, method: 'existingSession' }); }
  info = await probe(page);

  let careerDecision: CareerAccountDecision | undefined;
  if (d.careerSite && d.consent.creation_comptes_ats && d.accountDecision && !(await d.vault.get(origin))) {
    careerDecision = await d.accountDecision(host, d.email);
    if (careerDecision === 'existing') {
      await say('student confirms an existing account; waiting for manual login');
      return finish(await askHuman());
    }
    if (!careerDecision) {
      await say('no account decision received');
      return finish({ ok: false, method: 'needsHelp', error: 'career_account_decision_timeout' });
    }
  }

  // 2. SSO button + account chooser popup
  for (const prov of careerDecision === 'create' ? [] : info.ssoProviders) {
    const btn = page.locator('button, a, [role=button]').filter({ hasText: new RegExp(`(continuer avec|continue with|sign in with|se connecter avec|log in with|connexion avec)\\s*${prov}`, 'i') }).first();
    const popupP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
    await btn.click({ timeout: 5000 }).catch(() => {});
    const popup = await popupP;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      const acct = popup.getByText(d.email, { exact: false }).first(); // pick the account whose email is the student's
      if (await acct.isVisible().catch(() => false)) await acct.click().catch(() => {});
      await popup.waitForEvent('close', { timeout: 6000 }).catch(() => {});
      if (!popup.isClosed()) await popup.close().catch(() => {});
    }
    if (await waitNotLogin(page, 6000)) { await say(`sso ${prov}`); return finish({ ok: true, method: 'ssoButton' }); }
  }

  // 3. browser autofill (experimental, local Chrome only): we only test that the password field is non-empty, never read its value
  if (careerDecision !== 'create' && d.local) {
    await sleep(1500);
    const f = loginFields(page);
    if (await f.pw.first().isVisible().catch(() => false)) {
      await f.id.click().catch(() => {}); await sleep(500); // a real click is the user gesture Chrome needs
      if ((await f.pw.first().inputValue().catch(() => '')).length > 0) {
        await f.submit.click().catch(() => {});
        if (await waitNotLogin(page, 6000)) { await say('autofill (experimental)'); return finish({ ok: true, method: 'browserAutofill' }); }
      }
    }
  }

  const entry = await d.vault.get(origin);
  const loginUrl = page.url();

  // 4. vault credentials
  if (entry && budget()) {
    if (await viaVault(page, d, entry)) { await say('vault credentials'); await d.vault.set(origin, { ...entry, last_used_at: new Date().toISOString() }); return finish({ ok: true, method: 'vaultCredentials' }); }
    await say('vault credentials did not work');
  } else if (entry) { // nothing was tried: never report the credentials as rejected, and do not burn a sign-up or a reset on a guess
    await say('daily login attempts used up');
    return finish({ ok: false, method: 'askHuman', error: `${d.maxAttempts ?? 3} tentatives de connexion déjà utilisées aujourd'hui sur ${host} : réessayer demain` });
  }

  if (entry && entry.created_by === 'agent' && !entry.last_used_at && d.consent.creation_comptes_ats && !d.signupTried?.has(host)) {
    // created by the agent but never used to log in: the sign-up was probably interrupted. Register again once WITH THE SAME password (the form reuses
    // the vault entry): if the account does exist but is not activated yet, deleting the entry would lose its only password.
    d.signupTried?.add(host); await say('agent password never used: registering again with it'); return finish({ ok: false, method: 'needsSignup' });
  }
  if (entry && d.escalate) { // saved credentials rejected: let the model read the site's message (account not activated? wrong password?)
    const msg = (await page.locator('[role=alert], [class*=error i], [class*=alert i], [class*=invalid i]').allInnerTexts().catch(() => [])).join(' | ').slice(0, 300);
    await say(`login rejected: ${msg || 'no message'}`); return finish({ ok: false, method: 'needsHelp' as AuthMethod, error: msg || 'login rejected' });
  }



  // account creation comes before reset when there is no account yet (the caller drives the sign-up form)
  if (!entry && d.consent.creation_comptes_ats && !d.signupTried?.has(host)) { // the page may offer sign-up or a guest application under any wording: let the batch engine read it
    d.signupTried?.add(host); await say('no account yet: sign-up'); return finish({ ok: false, method: 'needsSignup' });
  }

  // 5. password reset, only with explicit consent
  if (d.consent.reset_mot_de_passe === true && budget()) {
    const r = await resetPassword(page, d);
    if (r.ok) {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      const fresh = await d.vault.get(origin);
      if (fresh && await viaVault(page, d, fresh)) {
        await say('password reset'); await d.notify(`J'ai réinitialisé ton mot de passe sur ${host}, il est dans ton coffre.`);
        return finish({ ok: true, method: 'passwordReset' });
      }
      if (r.previous) await d.vault.set(origin, r.previous); else await d.vault.remove(origin); // reset failed: do not keep a password that does not work
    }
    await say(`password reset failed: ${r.error ?? 'login after reset failed'}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  return finish(await askHuman());

  // 6. ask the student, then poll for a valid session (5 s, 10 min)
  async function askHuman(): Promise<LoginResult> {
    await d.notify(`Connecte-toi sur ${host} dans la fenêtre Chrome de l'agent, je reprends ensuite.`);
    const every = d.pollMs ?? 5000;
    const ok = await waitNotLogin(page, d.humanTimeoutMs ?? 600_000, every);
    await say(ok ? 'student logged in' : 'timeout waiting for the student');
    return { ok, method: 'askHuman', error: ok ? undefined : 'human_timeout' };
  }
}

async function viaVault(page: Page, d: AuthDeps, e: NonNullable<Awaited<ReturnType<AuthDeps['vault']['get']>>>): Promise<boolean> {
  const f = () => loginFields(page);
  const settle = async () => { await page.waitForLoadState('domcontentloaded').catch(() => {}); await sleep(600); };
  if (!(await f().pw.first().isVisible().catch(() => false))) { // two-step login: identifier first
    await f().id.fill(resolve(TOKENS.username, e)); await f().submit.click(); await settle();
  } else if (await f().id.isVisible().catch(() => false)) await f().id.fill(resolve(TOKENS.username, e));
  if (!(await f().pw.first().isVisible().catch(() => false))) return false;
  await f().pw.first().fill(resolve(TOKENS.password, e)); await f().submit.click(); await settle();
  if (e.totpSecret && await f().code.isVisible().catch(() => false)) { await f().code.fill(resolve(TOKENS.totp, e)); await f().submit.click(); await settle(); }
  return waitNotLogin(page, 3000);
}

// success rate per method and per domain, from runs/auth-metrics.json
export function authStats(file = 'runs/auth-metrics.json') {
  const rows = readJson<{ domain: string; method: string; ok: boolean }[]>(file, []);
  const out: Record<string, { tries: number; ok: number }> = {};
  for (const r of rows) for (const k of [`method:${r.method}`, `domain:${r.domain}`]) { out[k] ??= { tries: 0, ok: 0 }; out[k].tries++; if (r.ok) out[k].ok++; }
  return out;
}
