import 'dotenv/config';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { complete, totalSpentEur } from './llm/index.js';
import { draftEmail, toneFor, type Contact } from './networking/core.js';

// Usage: npx tsx src/evalDrafts.ts avant|apres   -> docs/eval-drafts.md ("avant" overwrites, other labels append)
const label = process.argv[2] ?? 'avant';
const profile = JSON.parse(readFileSync('profiles/test-candidate.json', 'utf8'));
const mk = (firstName: string, lastName: string, title: string, company: string): Contact => ({ firstName, lastName, title, company, profileUrl: '' });
const cases: { c: Contact; fact: string }[] = [
  { c: mk('Thomas', 'Girard', 'Analyst M&A', 'Lazard'), fact: 'ancienne de HEC' },
  { c: mk('Julie', 'Marchand', 'Associate DCM', 'BNP Paribas'), fact: 'a publié sur LinkedIn sur le marché obligataire' },
  { c: mk('Antoine', 'Lefèvre', 'VP ECM', 'Société Générale'), fact: 'intervenu à une conférence HEC Finance Club' },
  { c: mk('Sophie', 'Delmas', 'Managing Director', 'Rothschild & Co'), fact: '' },
  { c: mk('Hugo', 'Perrin', 'Analyst Leveraged Finance', 'Natixis'), fact: 'a fait la même prépa ECG' },
  { c: mk('Claire', 'Rousseau', 'Director Corporate Finance', 'un groupe industriel'), fact: 'basé à Londres' },
];
const RULES = [
  "objectif = court appel pour échanger sur le quotidien du contact et d'éventuelles opportunités, jamais de demande de stage directe",
  'tu + « Bonjour Prénom » jusqu\'à associate ; vous + « Bonjour Madame/Monsieur Nom » à partir de VP',
  '5 à 8 lignes', 'personnalisé avec le fait fourni (ou le rôle si aucun fait), sans l\'inventer ou le déformer',
  "présentation de l'étudiante selon son profil (programme, année, césure)", 'pas de pièce jointe, pas de lien',
  'aucun fait inventé sur l\'étudiante ni sur le contact', "style pair, sans formules d'IA (j'espère que vous allez bien, je me permets, tirets longs, listes de trois, contrastes « ce n'est pas X, c'est Y », points d'exclamation)",
  'objet de 2 à 5 mots en minuscules',
];
type Judge = { ok_rules: string[]; broken_rules: { rule: string; evidence: string }[]; invented_facts: string[]; verdict: 'bon' | 'moyen' | 'mauvais' };
const judgeSchema = { type: 'object', properties: { ok_rules: { type: 'array', items: { type: 'string' } },
  broken_rules: { type: 'array', items: { type: 'object', properties: { rule: { type: 'string' }, evidence: { type: 'string' } }, required: ['rule', 'evidence'] } },
  invented_facts: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string', enum: ['bon', 'moyen', 'mauvais'] } }, required: ['ok_rules', 'broken_rules', 'invented_facts', 'verdict'] };

const before = totalSpentEur();
const out: { c: Contact; tone: string; fact: string; subject: string; body: string; j: Judge }[] = [];
for (const { c, fact } of cases) {
  const tone = toneFor(c.title);
  const d = await draftEmail(profile, c, tone, fact);
  const r = await complete<Judge>({ role: 'writer', schema: judgeSchema,
    fixed: `Tu es un relecteur strict. Vérifie un email de networking d'une étudiante à un professionnel de la finance, règle par règle. Règles :\n${RULES.map((x, i) => `${i + 1}. ${x}`).join('\n')}\nRenvoie ok_rules (règles respectées), broken_rules (règle + citation exacte de l'email), invented_facts (faits absents du profil étudiant et du fait fourni), verdict : bon (aucune règle cassée), moyen (1-2 mineures), mauvais (fait inventé ou demande de stage ou ton/salutation faux).\nProfil étudiante : ${JSON.stringify(profile)}`,
    dynamic: `CONTACT: ${c.firstName} ${c.lastName}, ${c.title}, ${c.company}\nTON ATTENDU: ${tone}\nFAIT FOURNI: ${fact || '(aucun)'}\nOBJET: ${d.subject}\nCORPS:\n${d.body}` });
  out.push({ c, tone, fact, subject: d.subject, body: d.body, j: r.data });
  console.log(c.title, '->', r.data.verdict, r.data.broken_rules.map((b) => b.rule).join(' | '));
}
const cost = totalSpentEur() - before;
const md = `\n## ${label}\n\n| Contact | Ton | Verdict | Règles cassées | Faits inventés |\n|---|---|---|---|---|\n` +
  out.map((o) => `| ${o.c.title}, ${o.c.company} | ${o.tone} | ${o.j.verdict} | ${o.j.broken_rules.map((b) => `${b.rule} (« ${b.evidence} »)`).join('<br>') || '-'} | ${o.j.invented_facts.join('; ') || '-'} |`).join('\n') +
  `\n\n### Emails\n\n` + out.map((o) => `**${o.c.title}, ${o.c.company}** (fait : ${o.fact || 'aucun'})\n\nObjet : ${o.subject}\n\n${o.body}\n`).join('\n---\n\n') +
  `\nCoût ${label} : ${cost.toFixed(4)} EUR (totalSpentEur ${before.toFixed(4)} -> ${totalSpentEur().toFixed(4)})\n`;
if (label === 'avant' || !existsSync('docs/eval-drafts.md')) writeFileSync('docs/eval-drafts.md', '# Évaluation des brouillons de networking\n' + md); else appendFileSync('docs/eval-drafts.md', md);
