import type { BrowserContext } from 'playwright-core';
import { complete } from '../llm/index.js';
import { guardOutgoing } from './guard.js';
import { nextSlot, type Contact, type Item } from './core.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const prune = (t: string) => t.split('\n').map((l) => (l.length > 260 ? `${l.slice(0, 160)}…${l.slice(-80)}` : l)).join('\n');

// LinkedIn, READ ONLY: ONE people search, ONE results page (max 10 profiles). No profile visit, no invitation, no message (plan, safety rules).
export async function findContacts(context: BrowserContext, target: string, max = 10): Promise<(Contact & { fact: string })[]> {
  const kw = await complete<{ keywords: string }>({ fixed: 'Turn the student\'s target into ONE LinkedIn people-search keyword string (company, role/team, seniority, school if alumni). Max 8 words, no quotes.', dynamic: target,
    schema: { type: 'object', properties: { keywords: { type: 'string' } }, required: ['keywords'] } });
  const page = await context.newPage();
  try {
    await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw.data.keywords)}&origin=GLOBAL_SEARCH_HEADER`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await sleep(2000 + Math.random() * 2000);
    if (/login|authwall|checkpoint|signup/.test(page.url())) throw new Error('linkedin_not_logged_in: open LinkedIn once in the agent Chrome and log in (or paste 5 profile URLs: plan B)');
    const tree = prune(await page.ariaSnapshot({ mode: 'ai' })).slice(0, 70_000);
    const r = await complete<{ contacts: (Contact & { fact: string })[] }>({
      fixed: `Extract the people shown in this LinkedIn search results page (max ${max}, in page order). For each: firstName, lastName (skip anonymous "LinkedIn Member"), title (current role), company (current employer, from the headline), profileUrl (the /in/ link), fact (ONE short real element visible on the card that can anchor an email: shared school, location, headline detail, mutual connection). Never invent.`,
      dynamic: tree, schema: { type: 'object', properties: { contacts: { type: 'array', items: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' }, profileUrl: { type: 'string' }, fact: { type: 'string' } }, required: ['firstName', 'lastName', 'title', 'company', 'profileUrl', 'fact'] } } }, required: ['contacts'] } });
    return r.data.contacts.slice(0, max);
  } finally { await page.close().catch(() => {}); }
}

// Gmail web: compose, then send now or schedule. TEST_MODE rewrites recipient and subject (guard.ts). `real=false` stops with the message composed.
export async function sendViaGmail(context: BrowserContext, item: Item, opts: { real: boolean; schedule: boolean; shotDir: string }): Promise<{ sent: boolean; to: string; subject: string; scheduledFor?: string; note: string }> {
  const out = guardOutgoing({ to: item.email, subject: item.subject });
  const page = await context.newPage();
  try {
    await page.goto(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(out.to)}&su=${encodeURIComponent(out.subject)}&body=${encodeURIComponent(item.body)}`, { waitUntil: 'domcontentloaded' });
    if (/accounts\.google\.com/.test(page.url())) throw new Error('gmail_not_logged_in');
    await page.getByRole('button', { name: /^(envoyer|send)\b/i }).first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: `${opts.shotDir}/${item.id}-composed.png` });
    if (!opts.real) return { sent: false, to: out.to, subject: out.subject, note: 'dry-run: message composed, not sent' };
    let when: Date | undefined;
    if (opts.schedule) {
      when = nextSlot();
      await page.getByRole('button', { name: /options d.envoi|more send options/i }).first().click({ timeout: 8000 });
      await page.getByRole('menuitem', { name: /programmer l.envoi|schedule send/i }).first().click({ timeout: 8000 });
      await page.getByText(/choisir une date et une heure|pick date & time/i).first().click({ timeout: 8000 });
      const pad = (n: number) => String(n).padStart(2, '0');
      await page.getByLabel(/^date$/i).first().fill(`${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()}`, { timeout: 8000 });
      await page.getByLabel(/^(heure|time)$/i).first().fill(`${pad(when.getHours())}:${pad(when.getMinutes())}`, { timeout: 8000 });
      await page.getByRole('button', { name: /programmer l.envoi|schedule send/i }).last().click({ timeout: 8000 });
    } else await page.getByRole('button', { name: /^(envoyer|send)\b/i }).first().click({ timeout: 8000 });
    await page.getByText(/message envoyé|message sent|programmé|scheduled/i).first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${opts.shotDir}/${item.id}-sent.png` });
    return { sent: true, to: out.to, subject: out.subject, scheduledFor: when?.toISOString(), note: out.redirected ? 'TEST_MODE: recipient replaced by the test address' : 'sent' };
  } finally { await page.close().catch(() => {}); }
}
