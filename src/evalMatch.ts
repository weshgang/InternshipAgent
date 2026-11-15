import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { rankOffers, judgeFor } from './match.js';
import { totalSpentEur } from './llm/index.js';
import { compileBrief, titleExclusions } from './brief.js';

// Quality of the offer selection on a labeled set (no browser): the set's objective is compiled into a brief, then the offers are judged,
// so the whole chain objective -> brief -> verdict is measured. Usage: npm run eval:match [-- test/fixtures/offers-labeled-marketing.json]
type L = { id: string; title: string; company: string; snippet: string; expected: string };
const fx: { objectif: string; offers: L[] } = JSON.parse(readFileSync(process.argv[2] ?? 'test/fixtures/offers-labeled.json', 'utf8')); const set = fx.offers;
const { brief } = await compileBrief(fx.objectif); const profile = { recherche: brief }; // only the set's objective: no period or targets leaking from another profile
console.log(`brief: ${brief.contrats.join(',')} | oui: ${brief.coeur.map((x) => x.role).join('; ')}${brief.a_confirmer.length ? `\na_confirmer: ${brief.a_confirmer.join(' | ')}` : ''}`);
const opened: string[] = []; // offers whose page would be opened in a real search
const before = totalSpentEur(); const t0 = Date.now();
const r = await rankOffers({ offers: set.map((x) => ({ id: x.id, title: x.title, company: x.company })), exclusions: titleExclusions(profile), judge: judgeFor(profile),
  fetchText: async (o) => { opened.push(o.id); return set.find((x) => x.id === o.id)!.snippet; } });
const m: Record<string, Record<string, number>> = {};
for (const j of r.all) { const e = set.find((x) => x.id === j.id)!.expected; m[e] ??= {}; m[e][j.verdict] = (m[e][j.verdict] ?? 0) + 1; }
console.log('rows = expected, columns = verdict'); console.table(m);
const fp = r.all.filter((j) => j.verdict === 'oui' && set.find((x) => x.id === j.id)!.expected === 'non');
const ouiExp = set.filter((x) => x.expected === 'oui').length, ouiFound = r.all.filter((j) => j.verdict === 'oui' && set.find((x) => x.id === j.id)!.expected === 'oui').length;
console.log(`false "oui" on a "non": ${fp.length} ${fp.map((j) => j.id).join(' ')}`);
console.log(`pages opened: ${opened.length}/${set.length} (${Math.round((100 * opened.length) / set.length)} %), of which expected "non": ${opened.filter((id) => set.find((x) => x.id === id)!.expected === 'non').length}`);
console.log(`recall of "oui": ${ouiFound}/${ouiExp} = ${Math.round((100 * ouiFound) / ouiExp)}%`);
for (const j of r.all) { const e = set.find((x) => x.id === j.id)!; if (j.verdict !== e.expected) console.log(`  ${j.id} expected ${e.expected}, got ${j.verdict}: ${e.title} | ${j.reason}`); }
console.log(`cost ${((totalSpentEur() - before) / set.length).toFixed(5)} EUR per offer, ${Math.round((Date.now() - t0) / 1000)} s total`);
