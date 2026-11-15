import type { BrowserContext } from 'playwright-core';
import { complete } from './llm/index.js';

// Brief 3.5, phase 0: read the verification code in the Gmail web tab of the agent's Chrome profile (the student logs in there once).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const schema = { type: 'object', properties: { found: { type: 'boolean' }, code: { type: 'string' }, link: { type: 'string' }, open_ref: { type: 'string' } }, required: ['found'] };
const FIXED = `You read a Gmail page: a list of emails (accessibility tree, elements have [ref=eN]) or the text of one email. Every email shown arrived AFTER the student asked a job application site for a verification code or confirmation link.
- On a list: find the email from the job application or recruiting site. Its sender may be the company, its group or its recruiting software (the sender hint is only a clue). If its code or link is visible in the list, return it; otherwise found=false and open_ref = ref of its row. Ignore newsletters, security alerts and other notifications.
- On one email: return its verification code (digits/letters only) and/or its confirmation link.
Never return a code listed as already used.`;

export type EmailResult = { code?: string; link?: string; error?: string; cost: number; calls: number };
// shortcut: Gmail's own DOM classes (.adn = one message, .a3s = its body) are undocumented; when they change the reader falls back to the whole page tree.
const NEWEST_MESSAGE = `(() => { const m = [...document.querySelectorAll('.adn')].pop(); return m?.querySelector('.a3s')?.innerText ?? ''; })()`;

// `since`: when the code was requested (the run start). Only emails received after it are searched, so a code from an earlier run or an earlier send
// can never be picked; the hint is NOT a search term, because the sender often differs from the company (Natixis offers send codes as "BPCE Recruiting Team").
export async function readEmailCode(context: BrowserContext, hint: string, used: Set<string>, snap: (t: string) => string, since = Date.now() - 3_600_000): Promise<EmailResult> {
  const page = await context.newPage();
  const out: EmailResult = { cost: 0, calls: 0 };
  const ask = async (content: string) => {
    const r = await complete<{ found: boolean; code?: string; link?: string; open_ref?: string }>({ fixed: FIXED, dynamic: `Already used codes: ${JSON.stringify([...used])}\nSender hint: ${hint}\n\n${content}`, schema });
    out.cost += r.costUsd; out.calls++; return r.data;
  };
  try {
    const search = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`after:${Math.floor(since / 1000)}`)}`;
    for (let i = 0; i < 6; i++) { // the email can take a few seconds to arrive
      await page.goto(search, { waitUntil: 'domcontentloaded' });
      if (/accounts\.google\.com/.test(page.url())) return { ...out, error: 'gmail_not_logged_in: log in to Gmail once in the agent Chrome profile' };
      await sleep(i === 0 ? 4000 : 8000);
      let r = await ask(snap(await page.ariaSnapshot({ mode: 'ai' })));
      if (!r.found && r.open_ref) { // a conversation stacks every code the site ever sent: read its newest message only
        await page.locator(`aria-ref=${r.open_ref}`).click({ timeout: 5000 }).catch(() => {});
        await sleep(2500);
        const newest = await page.evaluate<string>(NEWEST_MESSAGE).catch(() => '');
        r = await ask(newest ? `NEWEST MESSAGE OF THE CONVERSATION:\n${newest}` : snap(await page.ariaSnapshot({ mode: 'ai' })));
      }
      const code = r.code?.trim();
      if (r.found && ((code && !used.has(code)) || r.link)) { if (code) used.add(code); return { ...out, code, link: r.link }; }
    }
    return { ...out, error: 'no_email_found: no new verification email within ~50 s' };
  } finally { await page.close().catch(() => {}); }
}
