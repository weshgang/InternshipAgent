import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { complete } from './llm/index.js';

// One-time profile completion: structure the CV (docx), then ask the student what no CV contains. Re-run safely: only missing keys are asked.
// Usage: npm run onboard   (SKIP_ASK=1 to only extract the CV)
const FILE = process.env.PROFILE ?? 'profiles/test-candidate.json';
const p = JSON.parse(readFileSync(FILE, 'utf8'));
const get = (path: string) => path.split('.').reduce((o: any, k) => o?.[k], p);
const set = (path: string, v: unknown) => { const ks = path.split('.'); let o = p; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; o[ks.at(-1)!] = v; };
const save = () => writeFileSync(FILE, JSON.stringify(p, null, 2));

// 1. CV -> experiences, ecole, competences, langues (never invented: only what the CV says)
const docx = process.env.CV_DOCX ?? (p.documents?.cv_fr as string | undefined)?.replace(/\.pdf$/i, '.docx');
if (!p.experiences?.length && docx && existsSync(docx)) {
  const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { maxBuffer: 20e6 }).toString();
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
  const s = { type: 'object', properties: {
    ecole: { type: 'object', properties: { nom: { type: 'string' }, programme: { type: 'string' }, annee: { type: 'string' }, diplome_prevu: { type: 'string' } }, required: ['nom', 'programme', 'annee', 'diplome_prevu'] },
    experiences: { type: 'array', items: { type: 'object', properties: { entreprise: { type: 'string' }, poste: { type: 'string' }, dates: { type: 'string' }, missions: { type: 'array', items: { type: 'string' } } }, required: ['entreprise', 'poste', 'dates', 'missions'] } },
    competences: { type: 'array', items: { type: 'string' } }, langues: { type: 'array', items: { type: 'string' } } }, required: ['ecole', 'experiences', 'competences', 'langues'] };
  const r = await complete<{ ecole: object; experiences: object[]; competences: string[]; langues: string[] }>({
    fixed: 'Extract structured data from a student CV. Use ONLY what the CV says; use "" when a value is absent; keep the CV language.', dynamic: text.slice(0, 30000), schema: s });
  Object.assign(p, { ecole: p.ecole ?? r.data.ecole, experiences: r.data.experiences, competences: p.competences?.length ? p.competences : r.data.competences, langues: p.langues?.length ? p.langues : r.data.langues });
  save();
  console.log(`CV read: ${r.data.experiences.length} experiences, ${r.data.competences.length} skills, ${r.data.langues.length} languages.`);
}

// 2. What no CV contains
const Q: [string, string, 'text' | 'bool'][] = [
  ['identite.genre', 'Genre tel qu’il apparaît sur les formulaires (Homme / Femme / Autre) ?', 'text'],
  ['identite.date_naissance', 'Date de naissance (JJ/MM/AAAA) ?', 'text'],
  ['identite.nationalite', 'Nationalité ?', 'text'],
  ['identite.adresse', 'Adresse postale complète (rue, code postal, ville, pays) ?', 'text'],
  ['cesure.debut', 'Date de début souhaitée du poste (stage, alternance, emploi) (JJ/MM/AAAA) ?', 'text'],
  ['cesure.duree_mois', 'Durée souhaitée en mois ?', 'text'],
  ['reponses_types.disponibilite', 'Disponibilité à indiquer aux recruteurs (ex. « À partir du 01/02/2027 ») ?', 'text'],
  ['reponses_types.pretentions', 'Prétentions de rémunération / gratification à indiquer (ex. « Selon grille légale ») ?', 'text'],
  ['reponses_types.droit_au_travail', 'Droit de travailler en France / dans l’UE (ex. « Oui, nationalité française ») ?', 'text'],
  ['reponses_types.permis', 'Permis de conduire / véhicule (ex. « Permis B ») ?', 'text'],
  ['reponses_types.mobilite', 'Mobilité géographique (villes, pays, télétravail) ?', 'text'],
  ['reponses_types.pourquoi_nous', 'En 2 à 3 phrases : pourquoi cette recherche (stage, alternance, emploi) et ce que vous voulez y apprendre (base des lettres de motivation) ?', 'text'],
  ['linkedin_url', 'URL de votre profil LinkedIn ?', 'text'],
  ['consentements.cgu_sites', 'L’agent peut-il accepter à votre place les CGU / politiques de confidentialité des sites carrières, nécessaires pour candidater ? (oui/non)', 'bool'],
  ['consentements.ia_screening', 'Acceptez-vous que les recruteurs utilisent de l’IA pour analyser votre candidature quand on le demande ? (oui/non)', 'bool'],
  ['consentements.vivier', 'Acceptez-vous d’être conservé dans les viviers de candidats des entreprises quand on le demande ? (oui/non)', 'bool'],
];
if (!process.env.SKIP_ASK) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (const [path, q, type] of Q) {
    if (get(path) !== undefined && get(path) !== '') continue;
    const a = (await rl.question(`\n${q}\n> `)).trim();
    if (!a) continue; // left empty: the agent will ask when a form needs it
    set(path, type === 'bool' ? /^(o|oui|y|yes)/i.test(a) : a);
    save();
  }
  rl.close();
  console.log('\nprofile.json updated. Edit it by hand any time.');
}
