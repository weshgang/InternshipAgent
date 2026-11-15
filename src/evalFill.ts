import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { complete, totalSpentEur } from './llm/index.js';
import { buildPrompt, planSchema } from './prompt.js';

// Replay evaluation of the form engine: form pages recorded in runs/ go through the engine's planner (no browser),
// and Sonnet grades each plan. Usage: npm run eval:fill -- [max pages, default 20]   -> docs/eval-fill.md
const max = Number(process.argv[2] ?? 20);
const profile = JSON.parse(readFileSync(process.env.PROFILE ?? 'profiles/test-candidate.json', 'utf8'));

// 1. distinct form pages (same page recorded by several runs counts once)
const seen = new Set<string>(); const pages: { file: string; snap: string }[] = [];
for (const day of readdirSync('runs').filter((d) => /^\d{4}-/.test(d)))
  for (const run of readdirSync(`runs/${day}`)) for (const f of readdirSync(`runs/${day}/${run}`).filter((x) => x.endsWith('-snapshot.txt'))) {
    const snap = readFileSync(`runs/${day}/${run}/${f}`, 'utf8');
    if ((snap.match(/textbox|combobox|checkbox|radio/g) ?? []).length < 3) continue; // not a form
    const key = createHash('md5').update(snap.replace(/\[ref=[^\]]+\]/g, '').slice(0, 4000)).digest('hex');
    if (!seen.has(key)) { seen.add(key); pages.push({ file: `runs/${day}/${run}/${f}`, snap }); }
  }
const sample = pages.slice(0, max);
console.log(`${pages.length} distinct form pages, evaluating ${sample.length}`);

type Plan = { fields: { ref: string; label: string; kind: string; value: string }[]; missing: { label: string }[]; next: { action: string; label?: string; reason?: string } };
type Grade = { verdict: 'bon' | 'moyen' | 'mauvais'; wrong: { label: string; problem: string }[]; invented: string[]; missed_required: string[]; next_ok: boolean; comment: string };
const gradeSchema = { type: 'object', properties: { verdict: { type: 'string', enum: ['bon', 'moyen', 'mauvais'] }, wrong: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, problem: { type: 'string' } }, required: ['label', 'problem'] } }, invented: { type: 'array', items: { type: 'string' } }, missed_required: { type: 'array', items: { type: 'string' } }, next_ok: { type: 'boolean' }, comment: { type: 'string' } }, required: ['verdict', 'wrong', 'invented', 'missed_required', 'next_ok', 'comment'] };
const FIXED = buildPrompt(profile);
const JUDGE = `You grade the plan an automated agent made for ONE page of an internship application form. Student profile (the only source of facts): ${JSON.stringify(profile)}
The plan lists the fields it fills (ref, label, kind, value), the required fields it says are missing, and the next action. Password and code fields have empty values on purpose (the system types them); file inputs are handled by the system.
Grade strictly against the page and the profile:
- wrong: fields filled with a wrong value or format (wrong option, wrong date format, value of another field), or buttons/links put in fields.
- invented: values that are neither in the profile nor implied by it (a fact about the student the profile does not contain).
- missed_required: required fields (asterisk, "obligatoire", "required") that the profile could answer but the plan neither fills nor lists as missing.
- next_ok: the next action is the right one (forward button; final send = "submit"; "mismatch" only if the offer truly cannot fit the student's dates or contract). The offer's sector or field was already approved by a selection step before the form: do not grade the plan on it.
- Dates: the system converts DD/MM/YYYY to YYYY-MM-DD for native date pickers and the reverse for text fields, so either form is fine unless the page shows another format.
verdict: "bon" = a person would accept the plan as is; "moyen" = minor issues; "mauvais" = would block or send something wrong. comment: one French sentence on the main issue.`;

async function one(p: { file: string; snap: string }) {
  const plan = await complete<Plan>({ fixed: FIXED, schema: planSchema,
    dynamic: `Current site: (replay)\nAccount: no account yet for this site: create one (use the student email)\nVerification code available: no\nAnswers already given by the student: {}\n\nPAGE:\n${p.snap}` });
  const g = await complete<Grade>({ role: 'writer', fixed: JUDGE, schema: gradeSchema, dynamic: `PAGE:\n${p.snap.slice(0, 40000)}\n\nPLAN:\n${JSON.stringify(plan.data)}` });
  return { file: p.file, plan: plan.data, grade: g.data, haikuUsd: plan.costUsd };
}

const before = totalSpentEur(); const out: Awaited<ReturnType<typeof one>>[] = [];
for (let i = 0; i < sample.length; i += 4) { // 4 pages at a time
  out.push(...(await Promise.all(sample.slice(i, i + 4).map((p) => one(p).catch((e) => ({ file: p.file, plan: null as unknown as Plan, grade: { verdict: 'mauvais', wrong: [], invented: [], missed_required: [], next_ok: false, comment: `erreur: ${(e as Error).message.slice(0, 80)}` } as Grade, haikuUsd: 0 }))))));
  console.log(`  ${out.length}/${sample.length}`);
}

const count = (v: string) => out.filter((o) => o.grade.verdict === v).length;
const problems = out.flatMap((o) => [...o.grade.wrong.map((w) => `faux: ${w.label} (${w.problem})`), ...o.grade.invented.map((x) => `inventé: ${x}`), ...o.grade.missed_required.map((x) => `oublié: ${x}`)]);
const md = `# Évaluation rejouée du remplissage (${new Date().toISOString().slice(0, 16)})

${sample.length} pages de formulaire distinctes (enregistrées dans runs/), plan par Haiku 5.5 (moteur actuel), note par Sonnet 5.5.

| bon | moyen | mauvais | action suivante juste | champs inventés | coût Haiku moyen par page |
|---|---|---|---|---|---|
| ${count('bon')} | ${count('moyen')} | ${count('mauvais')} | ${out.filter((o) => o.grade.next_ok).length}/${out.length} | ${out.reduce((n, o) => n + o.grade.invented.length, 0)} | ${(out.reduce((n, o) => n + o.haikuUsd, 0) / Math.max(out.length, 1)).toFixed(4)} $ |

Coût total de l'évaluation (Haiku + juge Sonnet) : ${(totalSpentEur() - before).toFixed(3)} €.

## Par page
${out.map((o) => `- **${o.grade.verdict}** \`${o.file}\` : ${o.grade.comment}`).join('\n')}

## Problèmes relevés
${problems.map((x) => `- ${x}`).join('\n') || '- aucun'}
`;
writeFileSync('docs/eval-fill.md', md);
if (existsSync('docs/eval-fill.md')) console.log(md.split('\n').slice(0, 8).join('\n'));
