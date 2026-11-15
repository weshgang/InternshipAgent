// Regression check of the email-code reader (npm run check:email): needs the agent Chrome (chrome-agent.sh) logged in to the test Gmail,
// whose inbox keeps the BPCE thread of 2026-11-14 (4 codes in one conversation). Root causes it locks: the sender hint used as a mandatory
// search term (0 results: Natixis codes come from "BPCE Recruiting Team"), and a stale code read from an older message of the same thread.
import 'dotenv/config';
import { connect } from '../src/browser.js';
import { readEmailCode } from '../src/gmail.js';
// Feedback loop on the real test inbox. Code requested at 19:50 on Nov 14; the only email after that is the BPCE code of 19:51
// (older codes of 19:15/19:18/19:19 sit in the SAME thread). RED if the reader misses it or returns another code.
const prune = (t: string) => t.split('\n').filter((l) => !/^\s*- \/url:/.test(l)).map((l) => (l.length > 220 ? l.slice(0, 140) + '…' + l.slice(-70) : l)).join('\n');
const since = new Date(2026, 10, 14, 19, 50).getTime();
const browser = await connect(); const ctx = browser.contexts()[0];
// ground truth: the code inside the message stamped 7:51 PM (found by its time, not by "last message")
const p = await ctx.newPage();
await p.goto(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent('subject:"Confirmer votre identité"')}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5000); await p.locator('tr.zA').first().click(); await p.waitForTimeout(4000);
const truth: string = await p.evaluate(`(() => { const m = [...document.querySelectorAll('.adn')].find((x) => /7:51\\sPM/.test(x.querySelector('.g3')?.getAttribute('title') ?? '')); return (m?.querySelector('.a3s')?.innerText.match(/\\b\\d{6}\\b/) ?? [''])[0]; })()`);
await p.close();
if (!truth) { console.log('loop broken: ground truth not found'); process.exit(2); }
let red = 0;
for (const [name, hint, used, want] of [['fresh code, company hint', 'Natixis', new Set<string>(), truth], ['fresh code already used', 'Natixis', new Set([truth]), '']] as const) {
  const t = Date.now(); const r = await readEmailCode(ctx, hint, used, prune, since);
  const ok = (r.code ?? '') === want; if (!ok) red++;
  const what = r.code ? (r.code === truth ? 'the 19:51 code' : 'ANOTHER code (stale)') : r.error;
  console.log(`${ok ? 'GREEN' : 'RED  '} ${name}: got ${what}, want ${want ? 'the 19:51 code' : 'no code'} (${Math.round((Date.now() - t) / 1000)} s)`);
}
await browser.close(); process.exit(red ? 1 : 0);
