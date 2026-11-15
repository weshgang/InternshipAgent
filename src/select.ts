import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from './browser.js';
import { complete, totalSpentEur } from './llm/index.js';
import { readOffers } from './offers.js';
import { rankOffers, judgeFor, type Offer } from './match.js';
import { titleExclusions } from './brief.js';

// Étape 3 bis: search the configured job board, rank the offers, keep the "oui" for the batch.
// Usage: npm run select -- [offers per query, default 10]   -> data/offers-ranked.json (all, with reasons) + offers.json (the "oui")
const perQuery = Number(process.argv[2] ?? 10);
const profile = JSON.parse(readFileSync(process.env.PROFILE ?? 'profiles/test-candidate.json', 'utf8'));
const pause = () => new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
const before = totalSpentEur();

// The founder's own method (observed): no keywords, the site's filters in the URL (internship, job functions, Paris +30 km),
// newest first, page after page until offers get older than the student's limit. Presets live in profile.preferences.
const pref = profile.preferences ?? {};
const source = process.env.OFFERS_SOURCE ?? pref.job_board ?? 'jobteaser';
const listUrl = source === 'wttj'
  ? (process.env.WTTJ_URL ?? 'https://www.welcometothejungle.com/fr/jobs-matches?published_since=last_7d')
  : `${process.env.JOBTEASER_URL ?? 'https://dauphine.jobteaser.com'}/fr/job-offers`;
const cats: string[] = pref.jobteaser_categories ?? [];
const where: string = pref.jobteaser_location ?? '';
const maxAge = Number(pref.offres_max_jours ?? 7);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function ageDays(text: string): number | null { // "il y a 23 minutes / 3 heures / 2 jours / 1 semaine / 1 mois" or "Publiée le 3 novembre 2026"
  const rel = /il y a (\d+) (minute|heure|jour|semaine|mois)/i.exec(text);
  if (rel) return /minute|heure/.test(rel[2]) ? 0 : Number(rel[1]) * (rel[2].startsWith('sem') ? 7 : rel[2] === 'mois' ? 30 : 1);
  const abs = /(?:publi[ée]e?(?: le)?\s+)?(\d{1,2}) ([a-zéû]+) (\d{4})/i.exec(text); const mo = abs ? MONTHS.indexOf(abs[2].toLowerCase()) : -1;
  return abs && mo >= 0 ? Math.floor((Date.now() - new Date(Number(abs[3]), mo, Number(abs[1])).getTime()) / 86_400_000) : null;
}
// shortcut: JobTeaser's contract filter is used only for internships (the one value verified); other contracts are left to the judge, add their URL values when known.
const contrats: string[] = profile.recherche?.contrats ?? [];
const internshipOnly = !contrats.length || contrats.every((c) => c === 'stage');
const base = source === 'wttj'
  ? listUrl
  : `${listUrl}?${internshipOnly ? 'contract=internship' : ''}${cats.map((c) => `&job_category_uuids=${c}`).join('')}${where ? `&${where}` : ''}&sort=recency`;
console.log('search:', base.replace(listUrl, '').slice(0, 160));

const browser = await connect();
const page = await browser.contexts()[0].newPage();
const found = new Map<string, Offer & { type?: string }>();
const key = (o: { title: string; company?: string }) => `${o.title}|${o.company ?? ''}`.toLowerCase().replace(/\s+/g, ' '); // same ad posted twice
const keys = new Set<string>(); const tooOld: (Offer & { reason: string })[] = [];
for (let pg = 1; pg <= (source === 'wttj' ? 1 : 15); pg++) {
  await page.goto(source === 'wttj' ? base : `${base}&page=${pg}`, { waitUntil: 'domcontentloaded' });
  if (/connect\.jobteaser|welcometothejungle\.com\/fr\/authenticate|login|sign_in/.test(page.url())) { console.error(`${source} session expired: log in once in the agent Chrome, then run again.`); process.exit(1); }
  await page.locator(source === 'wttj' ? 'a[href*="/companies/"][href*="/jobs/"]' : 'ul[class*=results] a[href*="/job-offers/"]').first().waitFor({ timeout: 20000 }).catch(() => {}); // results render after the page
  await pause();
  const got = await readOffers(page, 50);
  let fresh = 0;
  for (const o of got) {
    if (found.has(o.url) || keys.has(key(o))) continue; keys.add(key(o));
    const age = /offre de la semaine/i.test(o.card) ? null : ageDays(o.card); // pinned ads carry no date
    const of = { id: `j${found.size + tooOld.length + 1}`, title: o.title, company: o.company, url: o.url, type: o.type };
    if (age !== null && age > maxAge) tooOld.push({ ...of, reason: `publiée il y a ${age} jours (limite ${maxAge})` }); else { found.set(o.url, of); if (age !== null) fresh++; }
  }
  console.log(`  page ${pg}: ${got.length} offers, ${fresh} dated within ${maxAge} days, ${found.size} kept so far`);
  if (!got.length || (fresh === 0 && got.some((o) => !/offre de la semaine/i.test(o.card)))) break; // newest first: once a page has nothing recent, stop
}

const offers = [...found.values()];
// Availability window: from the student's start month to two months later (e.g. dispo 01/03/2027 -> 2027-03 to 2027-05).
const dispo = /(\d{2})\/(\d{4})$/.exec(profile.reponses_types?.disponibilite ?? '');
const startOk = (start: string) => {
  if (!dispo || !/^\d{4}-\d{2}$/.test(start)) return null;
  const m = (s: string) => { const [y, mo] = s.split('-').map(Number); return y * 12 + mo; };
  const from = Number(dispo[2]) * 12 + Number(dispo[1]); const d = m(start) - from;
  if (d >= 0 && d <= 2) return null; // dans la fenêtre
  if (d >= -2 && d < 0) {
    // 1 à 2 mois plus tôt (ex: janvier ou février pour une dispo en mars): arbitrage possible pour l'étudiant
    return { verdict: 'peut-être' as const, reason: `début ${start} (avant ta disponibilité ${profile.reponses_types.disponibilite}) : aménagement possible ?`, early: true };
  }
  return { verdict: 'non' as const, reason: `début ${start}, incompatible avec ta disponibilité (${profile.reponses_types.disponibilite})` };
};
// Start month read by code first (the model often leaves it empty): explicit date, "à partir de juillet 2027", "MARS 2027" in the title.
const starts = new Map<string, string>();
function startFrom(t: string): string | null {
  const d = /(?:prise de fonction|d[ée]but\w*|commence\w*|start\w*)[^\d]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i.exec(t); // "Date de prise de fonction 05/07/2027", "débute le 04/01/2027"
  if (d) return `${d[3]}-${d[2]}`;
  const m = new RegExp(`(?:à partir d[eu]|d[ée]but(?:ant)?(?: en)?|date de d[ée]but\\s*:?)\\s*(${MONTHS.join('|')})\\s+(\\d{4})`, 'i').exec(t) ?? new RegExp(`\\b(${MONTHS.join('|')}|aout)\\s+(\\d{4})`, 'i').exec(t.split('\n')[0]);
  if (!m) return null; const mo = m[1].toLowerCase() === 'aout' ? 8 : MONTHS.indexOf(m[1].toLowerCase()) + 1; return `${m[2]}-${String(mo).padStart(2, '0')}`;
}
const r = await rankOffers({ offers, startOk, exclusions: titleExclusions(profile), judge: judgeFor(profile),
  fetchText: async (o) => { // pass 2 reads the offer page (one page at a time, human pace)
    await page.goto(o.url!, { waitUntil: 'domcontentloaded' }); await pause();
    const text = await page.locator('main').innerText().catch(() => page.innerText('body'));
    const st = startFrom(`${o.title}\n${text}`); if (st) starts.set(o.id, st);
    if (/vous avez postul[ée]/i.test(text)) throw new Error('already applied'); // the student's own account already applied: rankOffers marks it
    const age = ageDays(text);
    if (age !== null && age > maxAge) throw new Error(`too old: publiée il y a ${age} jours (limite ${maxAge})`);
    return text.slice(0, 6000);
  } });
await page.close(); await browser.close();

for (const j of r.all) {
  const st = starts.get(j.id);
  if (st) {
    j.start = st;
    const res = j.verdict !== 'non' ? startOk(st) : null;
    if (res) {
      if (typeof res === 'string') { j.verdict = 'non'; j.reason = res; }
      else { j.verdict = res.verdict; j.reason = res.reason; j.early = res.early; }
    }
  }
}
const rows = [...offers.map((o) => ({ ...o, ...r.all.find((j) => j.id === o.id)! })), ...tooOld.map((o) => ({ ...o, verdict: 'non' as const, score: 0 }))];
mkdirSync('data', { recursive: true });
const OUT = process.env.RANKED_OUT ?? 'data/offers-ranked.json'; // a trial run can write elsewhere without replacing the shortlist
writeFileSync(OUT, JSON.stringify(rows, null, 1));
if (!process.env.RANKED_OUT) writeFileSync('offers.json', JSON.stringify(rows.filter((x) => x.verdict === 'oui').sort((x, y) => y.score - x.score).map((x) => ({ title: x.title, company: x.company, url: x.url, type: (x as { type?: string }).type })), null, 1));
console.table(rows.map((x) => ({ verdict: x.verdict, score: x.score, title: x.title.slice(0, 60), reason: x.reason.slice(0, 70) })));
console.log(`${r.toApply.length} "oui" saved to offers.json, ${rows.filter((x) => x.verdict === 'peut-être').length} "peut-être" for the student, cost ${(totalSpentEur() - before).toFixed(4)} EUR`);
