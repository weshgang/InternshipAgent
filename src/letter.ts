import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { complete } from './llm/index.js';

// Step 4: Sonnet writes a short cover letter from the offer text + profile. Anything the letter would need that is not in the profile
// goes to `ask_human` and is NOT stated. Runs in parallel with the navigation (fill.ts starts it on the first page).
export type Letter = { text: string; ask_human: string[]; pdf?: string; costUsd: number };
const schema = { type: 'object', properties: { letter: { type: 'string' }, ask_human: { type: 'array', items: { type: 'string' } } }, required: ['letter', 'ask_human'] };

export async function writeLetter(profile: unknown, offerText: string, dir: string): Promise<Letter> {
  const r = await complete<{ letter: string; ask_human: string[] }>({ role: 'writer', schema,
    fixed: `You write a short cover letter (160 to 200 words, 3 paragraphs, first person, formal register, no clichés, no flattery) for a student applying to the offer below, in the language of the offer (French: formal "vous"). The contract and the kind of role come from the offer and profile.recherche. Open with a concrete element of the offer (the team, its projects or missions named in the text) linked to one matching experience of the student, not with a generic formula. Ground every fact only in the profile and the offer text. Never invent an experience, number, skill, tool or motivation. If a fact the letter would need (e.g. why this specific company) is not in the profile or the offer, do not state it: add a short French question to ask_human. Start with the usual opening of that language ("Madame, Monsieur," in French, "Dear Hiring Manager," in English) and end with the student's first and last name. Student profile: ${JSON.stringify(profile)}`,
    dynamic: `OFFER:\n${offerText.slice(0, 6000)}` });
  const html = `<html><head><meta charset="utf-8"><style>body{font:11.5pt Helvetica,Arial,sans-serif;margin:60px;line-height:1.5;color:#111}</style></head><body>${r.data.letter.split(/\n+/).map((p) => `<p>${p.replace(/</g, '&lt;')}</p>`).join('')}</body></html>`;
  mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/letter.html`, html);
  const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const pdf = `${dir}/letter.pdf`; // a headless Chrome of its own: never the student's browser
  const ok = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${dir}/.pdfchrome`, `--print-to-pdf=${pdf}`, `file://${process.cwd()}/${dir}/letter.html`], { timeout: 30000 }).status === 0;
  return { text: r.data.letter, ask_human: r.data.ask_human, pdf: ok ? pdf : undefined, costUsd: r.costUsd };
}
