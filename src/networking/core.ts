import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { complete } from '../llm/index.js';

// Step 5 core: seniority -> tone, email guesses, draft by Sonnet, validation queue. Pure functions + a JSON file (no browser here).
export type Contact = { firstName: string; lastName: string; title: string; company: string; profileUrl: string };
export type Item = { id: string; contact: Contact; email: string; emailStatus: 'verified' | 'guessed'; alternatives: string[]; tone: 'tu' | 'vous'; subject: string; body: string;
  status: 'pending' | 'approved' | 'rejected' | 'sent'; scheduledFor?: string; sentTo?: string; note?: string };

// "Up to associate: tutoiement; from VP: vouvoiement" (plan, step 5). Unknown seniority -> vous (the safe side).
export const seniority = (title: string): 'junior' | 'senior' =>
  /\b(vice[- ]president|vp|svp|director|directeur|directrice|md|managing|partner|associé|head of|chief|ceo|cfo|principal|responsable|manager)\b/i.test(title) ? 'senior'
  : /\b(analyst|analyste|associate|stagiaire|intern|graduate|junior|trainee|consultant)\b/i.test(title) ? 'junior' : 'senior';
export const toneFor = (title: string) => (seniority(title) === 'junior' ? 'tu' : 'vous') as 'tu' | 'vous';

const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
// Common corporate formats; the first is the most frequent. Without a verifier they stay "guessed".
export function guessEmails(c: Pick<Contact, 'firstName' | 'lastName'>, domain: string): string[] {
  const f = ascii(c.firstName), l = ascii(c.lastName);
  return [`${f}.${l}@${domain}`, `${f[0]}.${l}@${domain}`, `${f}${l}@${domain}`, `${f[0]}${l}@${domain}`];
}
const KNOWN: Record<string, string> = { 'goldman sachs': 'gs.com', 'bnp paribas': 'bnpparibas.com', 'société générale': 'socgen.com', 'societe generale': 'socgen.com', 'natixis': 'natixis.com',
  'lazard': 'lazard.com', 'rothschild': 'rothschildandco.com', 'rothschild & co': 'rothschildandco.com', 'hsbc': 'hsbc.com', 'jp morgan': 'jpmorgan.com', 'jpmorgan': 'jpmorgan.com', 'morgan stanley': 'morganstanley.com', 'crédit agricole cib': 'ca-cib.com', 'credit agricole cib': 'ca-cib.com' };
export async function domainOf(company: string): Promise<string> {
  const k = Object.keys(KNOWN).find((n) => company.toLowerCase().includes(n)); if (k) return KNOWN[k];
  const r = await complete<{ domain: string }>({ fixed: 'Return the main corporate email domain of the company (e.g. "gs.com"), lowercase, no "www". If unsure return the most likely official domain.', dynamic: company,
    schema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } });
  return r.data.domain.replace(/^www\./, '');
}
// Hunter (free plan: 50 credits) ONLY when a key exists; otherwise the address stays "guessed".
export async function hunterFind(c: Contact, domain: string): Promise<{ email: string; verified: boolean } | undefined> {
  const key = process.env.HUNTER_API_KEY; if (!key) return;
  const u = `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(c.firstName)}&last_name=${encodeURIComponent(c.lastName)}&api_key=${key}`;
  const j = await (await fetch(u)).json().catch(() => null) as { data?: { email?: string; verification?: { status?: string } } } | null;
  return j?.data?.email ? { email: j.data.email, verified: j.data.verification?.status === 'valid' } : undefined;
}

const draftSchema = { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] };
export async function draftEmail(profile: unknown, c: Contact, tone: 'tu' | 'vous', fact: string): Promise<{ subject: string; body: string; costUsd: number }> {
  const salutation = tone === 'tu' ? `Bonjour ${c.firstName},` : `Bonjour Madame ${c.lastName}, or Bonjour Monsieur ${c.lastName}, according to the gender of the first name "${c.firstName}" (if truly ambiguous: "Bonjour Madame, Monsieur,")`;
  const r = await complete<{ subject: string; body: string }>({ role: 'writer', schema: draftSchema,
    fixed: `You write the FIRST networking email of a French business-school student to a finance professional. Goal: obtain a short call (15 minutes) to hear about the contact's day-to-day and possible opportunities. Never ask for an internship directly.
Rules: French. 5 to 8 lines, one paragraph break at most. ${tone === 'tu' ? `Tutoiement everywhere (tu, ton, te, "aurais-tu"), never "vous"; start with "Bonjour ${c.firstName},"` : `Vouvoiement everywhere (vous, votre, "auriez-vous"), never "tu"; start with the SALUTATION given below, never "Bonjour Prénom Nom"`}.
Write like a sharp peer, not like a template: one real element about the contact (given below, used exactly as stated, never attributed to the company or embellished) connected to why you write; the student introduces herself in one sentence (programme, year, and that she looks for a gap-year ("césure") from March 2027; one fact from the profile, past tense for anything already done, e.g. the Goldman Sachs summer 2026 as Summer Analyst); ONE low-friction ask: a 15-minute call ${tone === 'tu' ? '("aurais-tu 15 minutes cette semaine ou la suivante pour échanger ?")' : '("auriez-vous 15 minutes cette semaine ou la suivante pour échanger ?")'} to hear about the contact's day-to-day and possible opportunities; end with the first name and last name of the student. No attachment, no link, no HTML.
Never write "stage", "internship", "je cherche un stage", "candidature", "recrutement" or anything asking for a job: only the conversation is asked. If no element is given, mention the contact's role and team briefly without flattery.
Forbidden: "j'espère que vous allez bien", "je me permets de", flattery, contrast reveals ("ce n'est pas X, c'est Y"), lists of three, self-answered questions, em dashes or long dashes, exclamation marks. Never invent a fact about the student or the contact: use only the profile and the given element.
Subject: 2 to 5 words, lowercase, plain, matching the register (${tone === 'tu' ? '"échange sur ton parcours", "ton quotidien en M&A"' : '"échange sur votre parcours", "votre quotidien en ECM"'}), no emoji, vary it with the contact's field.
Student profile: ${JSON.stringify(profile)}`,
    dynamic: `CONTACT: ${c.firstName} ${c.lastName}, ${c.title}, ${c.company}\nREAL ELEMENT TO USE: ${fact || `their role (${c.title}) at ${c.company}`}\nSALUTATION: ${salutation}` });
  return { ...r.data, costUsd: r.costUsd };
}

const QUEUE = 'data/networking-queue.json';
export const loadQueue = (): Item[] => (existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, 'utf8')) : []);
export const saveQueue = (q: Item[]) => { mkdirSync('data', { recursive: true }); writeFileSync(QUEUE, JSON.stringify(q, null, 1)); };
export function setStatus(id: string, patch: Partial<Item>) { const q = loadQueue(); const i = q.findIndex((x) => x.id === id); if (i < 0) throw new Error(`unknown item ${id}`); q[i] = { ...q[i], ...patch }; saveQueue(q); return q[i]; }

// Gmail "Programmer l'envoi" window: 9:10 to 18:30 local time, weekdays; random minute; at least 30 minutes ahead.
export function nextSlot(now = new Date(), rnd = Math.random): Date {
  const d = new Date(now.getTime() + 30 * 60_000);
  for (let guard = 0; guard < 10; guard++) {
    const day = d.getDay(); const mins = d.getHours() * 60 + d.getMinutes();
    if (day !== 0 && day !== 6 && mins <= 18 * 60 + 30 - 10) { const lo = Math.max(mins, 9 * 60 + 10), hi = 18 * 60 + 30; const m = lo + Math.floor(rnd() * (hi - lo)); d.setHours(0, 0, 0, 0); d.setMinutes(m); return d; }
    d.setDate(d.getDate() + 1); d.setHours(9, 10, 0, 0);
  }
  return d;
}
