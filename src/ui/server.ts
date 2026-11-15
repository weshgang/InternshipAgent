import 'dotenv/config';
import { createServer, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadQueue, setStatus } from '../networking/core.js';
import { testMode } from '../networking/guard.js';
import { complete } from '../llm/index.js';
import { compileBrief, briefSummary } from '../brief.js';
import { enqueue } from '../networking/run.js';
import { readdirSync } from 'node:fs';
import { checkPreflight, openInChrome } from '../preflight.js';
import { careerAccountRecords, setCareerAccountDecision, type CareerAccountDecision } from '../auth/careerAccounts.js';

// Step 6: local demo page (127.0.0.1 only). Starts the same CLI scripts as the terminal and streams their output (Server-Sent Events).
const PORT = Number(process.env.UI_PORT ?? 4173);
const PROFILE = process.env.PROFILE ?? 'profiles/test-candidate.json';
const clients = new Set<ServerResponse>(); const backlog: string[] = []; let running = ''; let child: import('node:child_process').ChildProcess | undefined; let stopped = false;
const emit = (line: string) => { backlog.push(line); if (backlog.length > 400) backlog.shift(); for (const c of clients) c.write(`data: ${JSON.stringify(line)}\n\n`); };
const json = (res: ServerResponse, v: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
const readJson = <T,>(f: string, d: T): T => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);

function run(label: string, args: string[], env: Record<string, string> = {}, onDone?: (code: number | null) => void) {
  if (running) return `busy: ${running} is running`;
  running = label; stopped = false; emit(`▶ ${label}`);
  const p = spawn('npx', ['tsx', ...args], { env: { ...process.env, ...env, NO_ASK: '1' }, detached: true }); child = p; // own process group: Stop kills it and everything it started
  const pipe = (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach((l) => emit(l.slice(0, 400)));
  p.stdout.on('data', pipe); p.stderr.on('data', pipe); p.on('close', (c) => { emit(`■ ${label} finished (code ${c})`); running = ''; child = undefined; try { onDone?.(c); } catch (e) { say(`Erreur en lisant le résultat : ${(e as Error).message}`); } });
  return '';
}
// ---- Conversation: the student talks to the agent; the agent answers with messages and validation cards (data/chat.json).
type Msg = { role: 'student' | 'agent'; text: string; type?: 'shortlist' | 'applications' | 'drafts'; data?: unknown; at: string };
const CHAT = 'data/chat.json';
const chat = (): Msg[] => readJson<Msg[]>(CHAT, []);
function push(m: Omit<Msg, 'at'>) { mkdirSync('data', { recursive: true }); const c = chat(); c.push({ ...m, at: new Date().toISOString() }); writeFileSync(CHAT, JSON.stringify(c, null, 1)); }
const say = (text: string, type?: Msg['type'], data?: unknown) => push({ role: 'agent', text, type, data });
const lastPng = (dir?: string) => { if (!dir || !existsSync(dir)) return undefined; const f = readdirSync(dir).filter((x) => /-page\.png$/.test(x)).sort().pop(); return f ? `${dir}/${f}` : undefined; };

const best = (n: number) => readJson<any[]>('data/offers-ranked.json', []).filter((x) => x.verdict === 'oui').sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.url);
function afterSearch(code: number | null) {
  if (code !== 0) return stopped ? undefined : say("La recherche a échoué (voir le journal). Je n'ai rien préparé.");
  const rows = readJson<any[]>('data/offers-ranked.json', []).sort((a, b) => b.score - a.score);
  const oui = rows.filter((r) => r.verdict === 'oui').length, maybe = rows.filter((r) => r.verdict === 'peut-être').length;
  say(`J'ai lu ${rows.length} offres. ${oui} correspondent à ton objectif, ${maybe} sont proches ou à arbitrer, les autres sont écartées avec leur raison.`, 'shortlist', rows);

  // Date arbitration: offers starting 1-2 months before the student's availability (flagged "early" by the code in select.ts)
  const earlyOffers = rows.filter((r) => r.early);
  if (earlyOffers.length) {
    const dispo = readJson<any>(PROFILE, {}).reponses_types?.disponibilite ?? '?';
    const names = earlyOffers.slice(0, 3).map((o) => `${o.company ? o.company + ' : ' : ''}${o.title} (${o.start})`).join(' ; ');
    say(`💡 **Arbitrage de dates** : ${earlyOffers.length} offre(s) commencent un peu avant ta disponibilité (${dispo}), par exemple ${names}.\n\n👉 Si tu peux démarrer plus tôt, réponds **« Accepte la date plus tôt »** et je les prépare.`);
  }

  if (oui) prepare(best(3)); // the agent picks: the student only validates before anything is sent
}
function prepare(urls: string[]) {
  const ranked = readJson<any[]>('data/offers-ranked.json', []);
  const picked = urls.map((u) => ranked.find((r) => r.url === u)).filter(Boolean).slice(0, 5); // demo quota: 5
  if (!picked.length) return say('Aucune offre sélectionnée.');
  writeFileSync('offers.json', JSON.stringify(picked.map(({ title, company, url, type }) => ({ title, company, url, type })), null, 1));
  say(`Je prépare les ${picked.length} meilleure(s) : ${picked.map((p) => p.title).join(' ; ')}. Je remplis tout et je m'arrête avant « Envoyer » ; je te montre chaque candidature pour validation.`);
  const err = run(`prepare ${picked.length} application(s)`, ['src/batch.ts', String(picked.length)], { DRY_RUN: 'true', MAX_PAGES: '30', AGENT_MODE: 'auto' }, (code) => {
    if (code !== 0) return stopped ? undefined : say('La préparation a échoué avant la fin : je ne montre pas de résultat partiel.'); // never re-read an older batch file
    const f = readdirSync('runs').filter((x) => /^batch-\d+\.json$/.test(x)).sort().pop();
    const rows = f ? readJson<any[]>(`runs/${f}`, []).map((r) => ({ ...r, shot: lastPng(r.run) })) : [];
    const ready = rows.filter((r) => r.status === 'ready_to_submit').length;
    say(`${ready} candidature(s) sur ${rows.length} prête(s) à envoyer. Pour les autres, je te dis ce qui bloque.`, 'applications', rows);
  });
  if (err) say(`Je suis déjà occupé (${running}). Réessaie dans un instant.`);
}
const intentSchema = { type: 'object', properties: { intent: { type: 'string', enum: ['objective', 'prepare', 'contacts', 'status', 'other'] }, objective: { type: 'string' }, source: { type: 'string', enum: ['jobteaser', 'wttj'] }, max_age_days: { type: 'number' }, count: { type: 'number' },
  contacts: { type: 'array', items: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' }, fact: { type: 'string' } }, required: ['firstName', 'lastName', 'title', 'company', 'fact'] } }, reply: { type: 'string' } }, required: ['intent', 'reply'] };
async function onStudent(text: string) {
  push({ role: 'student', text });
  const p = readJson<any>(PROFILE, {});

  // Date arbitration answer: move the availability to the earliest "early" start and upgrade those offers
  const ranked0 = readJson<any[]>('data/offers-ranked.json', []); const early = ranked0.filter((r) => r.early && /^\d{4}-\d{2}$/.test(r.start ?? ''));
  if (early.length && /\b(accept|valid|ok)\w*\b.*(date|t[ôo]t|d[ée]but|janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)/i.test(text)) {
    const first = early.map((r) => r.start as string).sort()[0]; const [y, m] = first.split('-');
    const month = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][Number(m) - 1];
    p.cesure = { ...(p.cesure ?? {}), debut: `${month} ${y}` };
    p.reponses_types = { ...(p.reponses_types ?? {}), disponibilite: `01/${m}/${y}` };
    writeFileSync(PROFILE, JSON.stringify(p, null, 2));
    const up = early.filter((r) => r.score >= 30);
    for (const r of up) { r.verdict = 'oui'; r.early = false; r.reason = `Validé par l'étudiant (disponibilité avancée à ${month} ${y})`; }
    writeFileSync('data/offers-ranked.json', JSON.stringify(ranked0, null, 1));
    const ouiList = ranked0.filter((x) => x.verdict === 'oui').sort((a, b) => b.score - a.score);
    writeFileSync('offers.json', JSON.stringify(ouiList.map(({ title, company, url, type }) => ({ title, company, url, type })), null, 1));
    say(`✅ C'est noté : ta disponibilité passe au ${p.reponses_types.disponibilite}. ${up.length} offre(s) passent en « oui »${up.length ? ` (${up.slice(0, 3).map((r) => r.company || r.title).join(', ')})` : ''}. Je prépare les meilleures candidatures.`);
    prepare(best(3));
    return;
  }

  const r = await complete<{ intent: string; objective?: string; source?: 'jobteaser' | 'wttj'; max_age_days?: number; count?: number; contacts?: { firstName: string; lastName: string; title: string; company: string; fact: string }[]; reply: string }>({ schema: intentSchema,
    fixed: `You are the job-search agent of a student. Read the student's message and pick ONE intent: "objective" (they describe or correct what they look for: field, roles, contract, places, what they do not want, or they answer a question about it: put it in objective; if they limit how recent offers must be, max_age_days; ALSO when they ask to search again / relaunch: then leave objective empty), "prepare" (prepare applications; count if given), "contacts" (they paste people to contact: name, role, company, and a real fact about them if given, else ""), "status" (they ask where things are), "other". Set source="wttj" only if the student explicitly asks for Welcome to the Jungle; set source="jobteaser" only if explicitly asked for JobTeaser. reply: one short sentence in French, tutoiement, that says what you will do. Current search: ${JSON.stringify(p.recherche?.objectif ?? p.cibles?.objectif ?? '')}`,
    dynamic: text });
  const d = r.data;
  if (d.intent === 'objective') {
    const source = /\bwelcome\s+to\s+the\s+jungle\b|\bwttj\b/i.test(text) ? 'wttj' : /\bjobteaser\b/i.test(text) ? 'jobteaser' : d.source;
    let note = '';
    if (d.objective) { // a new or corrected objective: compile the brief from the student's own words, show it short, and search right away (a correction can follow at any time)
      const { brief } = await compileBrief(text, p.recherche ?? { objectif: p.cibles?.objectif, exclusions: p.cibles?.exclusions }, { lieux: p.cesure?.lieux, periode: p.cesure, disponibilite: p.reponses_types?.disponibilite });
      p.recherche = brief; p.cibles = { ...p.cibles, objectif: brief.objectif };
      note = `${briefSummary(brief)}${brief.a_confirmer[0] ? `\n(Si tu veux préciser : ${brief.a_confirmer[0]})` : ''}\n\n`;
    }
    if (d.max_age_days) p.preferences = { ...p.preferences, offres_max_jours: d.max_age_days };
    if (source) p.preferences = { ...p.preferences, job_board: source };
    writeFileSync(PROFILE, JSON.stringify(p, null, 2));
    const board = p.preferences?.job_board === 'wttj' ? 'Welcome to the Jungle' : 'JobTeaser';
    say(`${note}Je cherche sur ${board} (offres de moins de ${p.preferences?.offres_max_jours ?? 7} jours) et je trie chaque offre. Corrige-moi à tout moment : « pas de trading », « ajoute le crédit »…`);
    const err = run('search and rank the offers', ['src/select.ts', '10'], { OFFERS_SOURCE: p.preferences?.job_board ?? 'jobteaser' }, afterSearch); if (err) say(`Je suis déjà occupé (${running}).`);
  } else if (d.intent === 'prepare') {
    prepare(best(Math.min(d.count || 3, 5)));
  } else if (d.intent === 'contacts' && d.contacts?.length) {
    say(`${d.reply} Je devine leur email pro et je rédige un premier message pour chacun.`);
    await enqueue(d.contacts.slice(0, 10).map((c) => ({ ...c, profileUrl: '' })));
    say('Voici les brouillons. Rien ne part sans ta validation (en mode test, tout part vers l\'adresse de test).', 'drafts', loadQueue());
  } else if (d.intent === 'status') {
    const q = loadQueue(); const ranked = readJson<any[]>('data/offers-ranked.json', []);
    say(`${ranked.filter((x) => x.verdict === 'oui').length} offres retenues, ${q.filter((x) => x.status === 'pending').length} email(s) à valider, ${q.filter((x) => x.status === 'sent').length} envoyé(s).${running ? ` En cours : ${running}.` : ''}`);
  } else say(d.reply);
}

const state = () => {
  const p = readJson<any>(PROFILE, {}); const spend = readJson<any>('runs/spend.json', { total_eur: 0 });
  return { profile: { name: `${p.identite?.prenom ?? ''} ${p.identite?.nom ?? ''}`, email: p.identite?.email, school: p.ecole?.nom, programme: p.ecole?.programme, start: p.cesure?.debut, cv: p.documents?.cv_fr, targets: p.cibles },
    offers: readJson('offers.json', []), ranked: readJson('data/offers-ranked.json', []), chat: chat(), queue: loadQueue(), careerAccounts: careerAccountRecords(), spendEur: spend.total_eur, budgetEur: Number(process.env.LLM_BUDGET_EUR ?? 20), dryRun: process.env.DRY_RUN !== 'false', testMode: testMode(), running };
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x'); let body = Buffer.alloc(0); for await (const c of req) body = Buffer.concat([body, c as Buffer]);
  if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(readFileSync('src/ui/index.html')); }
  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, state());
  if (req.method === 'GET' && url.pathname === '/api/preflight') return json(res, await checkPreflight());
  if (req.method === 'GET' && /^\/runs\/[\w./-]+-page\.png$/.test(url.pathname) && !url.pathname.includes('..')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(readFileSync(url.pathname.slice(1))); } // screenshots before send
  if (req.method === 'GET' && url.pathname === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); backlog.forEach((l) => res.write(`data: ${JSON.stringify(l)}\n\n`)); clients.add(res); return void req.on('close', () => clients.delete(res)); }
  if (req.method !== 'POST' || req.headers['x-demo'] !== '1') return json(res, { error: 'not found' }, 404); // POST needs the header: a foreign web page cannot trigger actions
  const b = body.length && req.headers['content-type']?.includes('json') ? JSON.parse(body.toString()) : {};
  if (url.pathname === '/api/open-tab') { const ok = await openInChrome(String(b.url ?? '')); return json(res, { ok }); }
  if (url.pathname === '/api/cv') { mkdirSync('profiles', { recursive: true }); writeFileSync('profiles/uploaded-cv.pdf', body); const p = readJson<any>(PROFILE, {}); p.documents = { ...p.documents, cv_fr: './profiles/uploaded-cv.pdf' }; writeFileSync(PROFILE, JSON.stringify(p, null, 2)); return json(res, { ok: true }); }
  if (url.pathname === '/api/profile') { const p = readJson<any>(PROFILE, {}); if (b.start) p.cesure = { ...p.cesure, debut: b.start }; if (b.targets) p.cibles = { ...p.cibles, secteurs: String(b.targets).split(',').map((s: string) => s.trim()).filter(Boolean) }; writeFileSync(PROFILE, JSON.stringify(p, null, 2)); return json(res, { ok: true }); }
  if (url.pathname === '/api/stop') { if (!child?.pid) return json(res, { error: 'rien en cours' }); stopped = true; try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } say(`J'ai arrêté : ${running}.`); return json(res, { ok: true }); }
  if (url.pathname === '/api/chat') { onStudent(String(b.text ?? '').slice(0, 2000)).catch((e) => say(`Erreur : ${(e as Error).message.slice(0, 200)}`)); return json(res, { ok: true }); }
  if (url.pathname === '/api/career-account') {
    const host = String(b.host ?? '').trim();
    const decision = b.decision;
    if (!/^[a-z0-9.-]+$/i.test(host) || !['existing', 'create'].includes(decision)) return json(res, { error: 'Choix de compte carrière invalide.' }, 400);
    const email = String(readJson<any>(PROFILE, {}).identite?.email ?? '');
    return json(res, { ok: true, account: setCareerAccountDecision(host, decision as CareerAccountDecision, email) });
  }
  if (url.pathname === '/api/prepare') { prepare((b.urls as string[]) ?? []); return json(res, { ok: true }); }
  if (url.pathname === '/api/offers') return json(res, { error: run('search and rank the offers', ['src/select.ts', String(b.count ?? 10)]) });
  if (url.pathname === '/api/apply') { // applications: DRY_RUN unless the switch is off AND confirmed; never with the test identity
    const real = b.real === true && b.confirm === 'ENVOYER';
    if (real && testMode()) return json(res, { error: 'TEST_MODE is on: the test identity is never sent to a real company' }, 403);
    const sel = (b.urls as string[] | undefined)?.length ? b.urls : null; if (sel) writeFileSync('offers.json', JSON.stringify(readJson<any[]>('offers.json', []).filter((o) => sel.includes(o.url)), null, 1));
    return json(res, { error: run(real ? 'apply (REAL)' : 'apply (dry-run)', ['src/batch.ts', String(b.count ?? 5)], { DRY_RUN: real ? 'false' : 'true', MAX_PAGES: '25' }) });
  }
  if (url.pathname === '/api/network/find') return json(res, { error: run('networking search', ['src/networking/run.ts', 'find', String(b.target ?? ''), '10']) });
  const m = /^\/api\/network\/([^/]+)\/(approve|reject|edit|send)$/.exec(url.pathname);
  if (m) {
    const [, id, act] = m;
    if (act === 'approve' || act === 'reject') return json(res, setStatus(id, { status: act === 'approve' ? 'approved' : 'rejected' }));
    if (act === 'edit') return json(res, setStatus(id, { subject: b.subject, body: b.body, status: 'pending' }));
    return json(res, { error: run(`send ${id}${b.real ? ' (real)' : ' (compose only)'}`, ['src/networking/run.ts', 'send', id, ...(b.real && b.confirm === 'ENVOYER' ? ['--real'] : []), ...(b.schedule ? ['--schedule'] : [])]) });
  }
  json(res, { error: 'not found' }, 404);
}).listen(PORT, '127.0.0.1', () => console.log(`Demo UI: http://127.0.0.1:${PORT}`));
