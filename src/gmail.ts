import type { BrowserContext } from 'playwright-core';
import { complete } from './llm/index.js';

// Brief 3.5, phase 0: read the verification code in the Gmail web tab of the agent's Chrome profile (the student logs in there once).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const schema = { type: 'object', properties: { found: { type: 'boolean' }, code: { type: 'string' }, link: { type: 'string' }, open_ref: { type: 'string' } }, required: ['found'] };
const FIXED = `You read a Gmail web page (accessibility tree, elements have [ref=eN]). Find the verification / confirmation code, or the confirmation link, sent by a job application site, in the NEWEST email only (first row of the list, or the open email).
- Code or link visible: found=true, with code (digits/letters only) and/or link.
- Newest email matches but its body is not visible: found=false and open_ref = ref of that email row.
- Nothing matching: found=false.
Never return a code listed as already used.`;

export type EmailResult = { code?: string; link?: string; error?: string; cost: number; calls: number };

export async function readEmailCode(context: BrowserContext, hint: string, used: Set<string>, snap: (t: string) => string): Promise<EmailResult> {
  const page = await context.newPage();
  const out: EmailResult = { cost: 0, calls: 0 };
  try {
    // A long hint (the model's sentence) is no search term: fall back to the usual words of verification emails, newest hour only.
    const q = hint.length <= 30 && !/@/.test(hint) ? `${hint} newer_than:1d` : '(code OR vérification OR verification OR confirmation OR activation OR "one-time") newer_than:1h';
    await page.goto(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' });
    if (/accounts\.google\.com/.test(page.url())) return { ...out, error: 'gmail_not_logged_in: log in to Gmail once in the agent Chrome profile' };
    for (let i = 0; i < 6; i++) { // the email can take a few seconds to arrive
      await sleep(i === 0 ? 4000 : 8000);
      let tree = snap(await page.ariaSnapshot({ mode: 'ai' }));
      let r = await complete<{ found: boolean; code?: string; link?: string; open_ref?: string }>({ fixed: FIXED, dynamic: `Already used codes: ${JSON.stringify([...used])}\nSender hint: ${hint}\n\n${tree}`, schema });
      out.cost += r.costUsd; out.calls++;
      if (!r.data.found && r.data.open_ref) { // open the newest email and look again
        await page.locator(`aria-ref=${r.data.open_ref}`).click({ timeout: 5000 }).catch(() => {});
        await sleep(2500);
        tree = snap(await page.ariaSnapshot({ mode: 'ai' }));
        r = await complete({ fixed: FIXED, dynamic: `Already used codes: ${JSON.stringify([...used])}\nSender hint: ${hint}\n\n${tree}`, schema });
        out.cost += r.costUsd; out.calls++;
      }
      const code = r.data.code?.trim();
      if (r.data.found && ((code && !used.has(code)) || r.data.link)) { if (code) used.add(code); return { ...out, code, link: r.data.link }; }
      await page.reload().catch(() => {});
    }
    return { ...out, error: 'no_email_found: no new verification email within ~50 s' };
  } finally { await page.close().catch(() => {}); }
}
