import { randomInt } from 'node:crypto';
import type { Page } from 'playwright-core';
import { loginFields } from './detectLogin.js';
import { TOKENS, resolve } from './substitution.js';
import type { createVault } from './vault.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// shortcut: classes + length only, no per-site rule parsing; sites that forbid symbols need minLen/ symbols tuned by hand
export function generatePassword(len = 20): string {
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < len) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

export type ResetDeps = { vault: ReturnType<typeof createVault>; email: string; readEmail: (hint: string) => Promise<{ code?: string; link?: string; error?: string }> };

// Forgot-password flow. The new password is stored BEFORE it is submitted; the caller restores `previous` if the login then fails.
export async function resetPassword(page: Page, d: ResetDeps): Promise<{ ok: boolean; error?: string; previous?: Awaited<ReturnType<ResetDeps['vault']['get']>> }> {
  const origin = new URL(page.url()).origin;
  const link = page.locator('a, button').filter({ hasText: /mot de passe oubli|forgot (your )?password|mot de passe perdu|réinitialiser/i }).first();
  if (!(await link.isVisible().catch(() => false))) return { ok: false, error: 'no_forgot_link' };
  await link.click(); await page.waitForLoadState('domcontentloaded').catch(() => {});
  const f = loginFields(page);
  await f.id.fill(d.email); await f.submit.click(); await sleep(800);

  const m = await d.readEmail(new URL(origin).hostname);
  if (m.error) return { ok: false, error: m.error };
  if (m.link) {
    if (new URL(m.link).hostname !== new URL(origin).hostname) return { ok: false, error: 'reset_link_other_host' }; // never follow an arbitrary link from an email
    await page.goto(m.link, { waitUntil: 'domcontentloaded' });
  } else if (m.code && await f.code.isVisible().catch(() => false)) { await f.code.fill(m.code); await f.submit.click(); await sleep(800); }

  const n = await loginFields(page).pw.count();
  if (!n) return { ok: false, error: 'no_new_password_form' };
  const previous = await d.vault.get(origin);
  const entry = { username: d.email, password: generatePassword(), created_by: 'agent' as const };
  await d.vault.set(origin, entry);
  const full = (await d.vault.get(origin))!;
  for (let i = 0; i < n; i++) await loginFields(page).pw.nth(i).fill(resolve(TOKENS.password, full)); // new + confirm
  await loginFields(page).submit.click(); await sleep(800);
  return { ok: true, previous };
}
