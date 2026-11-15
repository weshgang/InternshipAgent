import 'dotenv/config';
import { mkdirSync, readFileSync } from 'node:fs';
import { connect } from '../browser.js';
import { complete } from '../llm/index.js';
import { domainOf, draftEmail, guessEmails, hunterFind, loadQueue, saveQueue, setStatus, toneFor, type Item } from './core.js';
import { findContacts, sendViaGmail } from './browser.js';
import { testMode } from './guard.js';

// Step 5 CLI.  find "<target>" [n]            -> search LinkedIn (read only), guess emails, draft with Sonnet, fill the validation queue
//              urls <url>... (plan B)        -> same, starting from profile URLs pasted by the student
//              list | approve <id> | reject <id> | send <id> [--real] [--schedule]
const profile = JSON.parse(readFileSync(process.env.PROFILE ?? 'profiles/test-candidate.json', 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);
const slug = (c: { firstName: string; lastName: string }) => `${c.firstName}-${c.lastName}`.toLowerCase().replace(/[^a-z-]/g, '');

export async function enqueue(contacts: { firstName: string; lastName: string; title: string; company: string; profileUrl: string; fact?: string }[]) {
  const q = loadQueue();
  for (const c of contacts) {
    const id = slug(c); if (q.some((x) => x.id === id)) continue;
    const domain = await domainOf(c.company); const guesses = guessEmails(c, domain);
    const h = await hunterFind(c, domain).catch(() => undefined);
    const tone = toneFor(c.title); const d = await draftEmail(profile, c, tone, c.fact ?? '');
    q.push({ id, contact: c, email: h?.email ?? guesses[0], emailStatus: h?.verified ? 'verified' : 'guessed', alternatives: guesses.filter((g) => g !== (h?.email ?? guesses[0])), tone, subject: d.subject, body: d.body, status: 'pending' } as Item);
  }
  saveQueue(q); return q;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === 'find') {
    const browser = await connect();
    const found = await findContacts(browser.contexts()[0], rest[0], Number(rest[1] ?? 10));
    console.log(`${found.length} contacts read on the first results page`);
    const q = await enqueue(found.slice(0, Number(process.env.QUOTA_EMAILS ?? 10)));
    console.table(q.map((x) => ({ id: x.id, title: x.contact.title.slice(0, 30), email: x.email, status: x.emailStatus, tone: x.tone })));
    await browser.close();
  } else if (cmd === 'list') {
    for (const x of loadQueue()) console.log(`\n[${x.status}] ${x.id}  ${x.email} (${x.emailStatus})\nObjet: ${x.subject}\n${x.body}`);
  } else if (cmd === 'approve' || cmd === 'reject') console.log(setStatus(rest[0], { status: cmd === 'approve' ? 'approved' : 'rejected' }).status);
  else if (cmd === 'send') {
    const item = loadQueue().find((x) => x.id === rest[0]); if (!item) throw new Error('unknown id');
    if (item.status !== 'approved') throw new Error(`"${item.id}" is ${item.status}: approve it first`);
    const browser = await connect(); const dir = `runs/${new Date().toISOString().slice(0, 10)}/networking`; mkdirSync(dir, { recursive: true });
    const r = await sendViaGmail(browser.contexts()[0], item, { real: rest.includes('--real'), schedule: rest.includes('--schedule'), shotDir: dir });
    console.log(r, testMode() ? '(TEST_MODE on)' : '');
    if (r.sent) setStatus(item.id, { status: 'sent', sentTo: r.to, scheduledFor: r.scheduledFor, note: r.note });
    await browser.close();
  } else console.log('usage: find "<target>" [n] | list | approve <id> | reject <id> | send <id> [--real] [--schedule]');
}
