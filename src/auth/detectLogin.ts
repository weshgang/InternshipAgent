import type { Page } from 'playwright-core';
import { complete } from '../llm/index.js';

// Heuristics first (no LLM). One Haiku call only when the page is ambiguous.
export type LoginInfo = { isLogin: boolean; isSignup: boolean; ssoProviders: string[]; captcha: boolean; loggedInMarker: boolean; uncertain: boolean };
const L = (s: string) => new RegExp(`(?<!\\p{L})(${s})(?!\\p{L})`, 'iu'); // word edges that understand accents ("déconnexion" must not match "connexion")
const LOGIN_WORDS = L('se connecter|connexion|sign in|log in|login');
const LOGGED_IN = L('déconnexion|se déconnecter|log ?out|sign out|mon compte|my account|mon profil');
const PROVIDERS = ['google', 'linkedin', 'microsoft', 'apple'];

export function detectLoginHtml(html: string, url = ''): LoginInfo {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const pw = (html.match(/<input[^>]*type\s*=\s*["']?password/gi) ?? []).length;
  const idField = /<input[^>]*(type\s*=\s*["']?email|name\s*=\s*["']?(email|username|login|user)\b)/i.test(html);
  const isSignup = pw >= 2 || /confirm(er|ation)?[^<]{0,25}(mot de passe|password)/i.test(html);
  const loggedInMarker = LOGGED_IN.test(text);
  const isLogin = !isSignup && !loggedInMarker && (pw >= 1 || (idField && LOGIN_WORDS.test(text)));
  const ssoProviders = PROVIDERS.filter((p) => new RegExp(`(continuer avec|continue with|sign in with|se connecter avec|log in with|connexion avec)\\s*${p}`, 'i').test(text));
  const captcha = /g-recaptcha|h-captcha|hcaptcha|cf-turnstile|captcha/i.test(html);
  const uncertain = !isLogin && !isSignup && !loggedInMarker && /login|signin|sign-in|auth|sso/i.test(url);
  return { isLogin, isSignup, ssoProviders, captcha, loggedInMarker, uncertain };
}

export async function detectLogin(page: Page, useLlm = true): Promise<LoginInfo> {
  const info = detectLoginHtml(await page.content(), page.url());
  if (!info.uncertain || !useLlm) return info;
  const r = await complete<{ isLogin: boolean; isSignup: boolean; ssoProviders: string[] }>({
    fixed: 'Given the accessibility tree of a web page, say whether it is a login form, a sign-up form, and which SSO providers (google, linkedin, microsoft, apple) it offers.',
    dynamic: (await page.ariaSnapshot({ mode: 'ai' })).slice(0, 8000),
    schema: { type: 'object', properties: { isLogin: { type: 'boolean' }, isSignup: { type: 'boolean' }, ssoProviders: { type: 'array', items: { type: 'string' } } }, required: ['isLogin', 'isSignup', 'ssoProviders'] },
  });
  return { ...info, ...r.data, uncertain: false };
}

export const loginFields = (page: Page) => ({
  pw: page.locator('input[type=password]:visible'),
  id: page.locator('input[type=email]:visible, input[name*=mail i]:visible, input[name*=user i]:visible, input[name*=login i]:visible, input[autocomplete=username]:visible, input[type=text]:visible').first(),
  submit: page.getByRole('button', { name: /se connecter|connexion|sign in|log in|login|suivant|next|continuer|continue|valider|envoyer|send|submit|réinitialiser|reset/i }).filter({ hasNotText: /google|linkedin|microsoft|apple/i }).first(),
  code: page.locator('input[autocomplete=one-time-code]:visible, input[name*=code i]:visible, input[name*=otp i]:visible').first(),
});
