import 'dotenv/config';
import type { Page } from 'playwright-core';
import { connect } from './browser.js';
import { createInterface } from 'node:readline/promises';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { complete, totalSpentEur } from './llm/index.js';
import { buildPrompt, planSchema } from './prompt.js';
import { typeCode, isRealError } from './codeEntry.js';
import { guardAction } from './agent/guard.js';
import { testMode } from './networking/guard.js';
import { takeover, type TakeoverResult } from './agent/loop.js';
import { makeModel } from './agent/model.js';
import { shouldTakeOver } from './agent/trigger.js';
import { scope } from './scope/allowlist.js';
import { createVault } from './auth/vault.js';
import { maskSnapshot } from './auth/substitution.js';
import { installConsoleRedaction, safeWrite } from './auth/redact.js';
import { detectLoginHtml } from './auth/detectLogin.js';
import { login } from './auth/loginOrchestrator.js';
import { generatePassword } from './auth/passwordReset.js';
import { writeLetter, type Letter } from './letter.js';
import { readEmailCode } from './gmail.js';
import { captureFormState, evaluateProgress, type PageFormState } from './formState.js';
import { waitForCareerAccountDecision } from './auth/careerAccounts.js';

// Batch engine (brief 3.12): per page = snapshot -> ONE LLM call -> deterministic fill -> next page.
// Handles JobTeaser, external career sites (new tabs), account creation (vault), email codes (Gmail), long-form answers (Sonnet).
// Usage: npm run fill -- <scenario> <url> [profile.json]
const [scenario = 'test', url = '', profilePath = process.env.PROFILE ?? 'profiles/test-candidate.json'] = process.argv.slice(2);
if (!url) { console.error('Usage: npm run fill -- <scenario> <url> [profile.json]'); process.exit(1); }

const DRY_RUN = process.env.DRY_RUN !== 'false';
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 15);
const FINAL_SUBMIT = /envoyer (ma|la) candidature|soumettre|submit|send application|finaliser/i; // backstop for DRY_RUN
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const human = () => sleep(150 + Math.random() * 350);

const runDir = `runs/${new Date().toISOString().slice(0, 10)}/${scenario}-${Date.now()}`;
mkdirSync(runDir, { recursive: true });
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const cvPath: string | undefined = profile.documents?.cv_fr;
const ANSWERS = process.env.ANSWERS_FILE ?? 'answers.json'; // answers given by the human, reused by later runs
const answers: Record<string, string> = existsSync(ANSWERS) ? JSON.parse(readFileSync(ANSWERS, 'utf8')) : {};

type Field = { ref: string; label: string; kind: 'text' | 'select' | 'check' | 'password' | 'code'; value: string; long_form?: boolean };
type Plan = {
  reasoning?: string;
  fields: Field[];
  missing: { label: string; question: string }[];
  next: { action: 'click' | 'submit' | 'done' | 'blocked' | 'need_email_code' | 'mismatch'; ref?: string; label?: string; reason?: string };
};
const schema = planSchema;

const schemaR = { ...schema, properties: { reasoning: { type: 'string' }, ...(schema as { properties: object }).properties }, required: ['reasoning', ...schema.required] }; // used only when something failed
const FIXED = buildPrompt(profile);
const TEST_NO_MISMATCH = process.env.TEST_NO_MISMATCH ? '\nTEST MODE: never answer "mismatch"; fill the form anyway.' : '';
const dynamic = (snapshot: string, ctx: string) => `${ctx}${TEST_NO_MISMATCH}\nAnswers already given by the student: ${JSON.stringify(answers)}\n\nPAGE:\n${snapshot}`;

const WRITER = `You write answers to job application questions for a student, in the first person, in the language of the question. Be concrete and sincere, 60-120 words unless the field asks otherwise, no clichés, no flattery. Ground every claim ONLY in the profile and the offer text: never invent experiences, numbers or skills. Student profile:
${JSON.stringify(profile)}`;
const writerSchema = { type: 'object', properties: { texts: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, text: { type: 'string' } }, required: ['label', 'text'] } } }, required: ['texts'] };

// Keep what the model needs (brief 3.10b rule 1): drop URLs, cap line length.
// Long labels are cut in the MIDDLE: the [ref=eN] sits at the end of the line and must survive.
const prune = (tree: string) => tree.split('\n').filter((l) => !/^\s*- \/url:/.test(l)).map((l) => (l.length > 220 ? l.slice(0, 140) + '…' + l.slice(-70) : l)).join('\n');
const choiceSchema = { type: 'object', properties: { choices: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, option: { type: 'string' } }, required: ['label', 'option'] } } }, required: ['choices'] };
const ask = async (q: string) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); const a = await rl.question(`\n[Agent asks] ${q}\n> `); rl.close(); return a; };

const browser = await connect();
const context = browser.contexts()[0];
const wire = (p: Page) => p.on('filechooser', (fc) => { if (cvPath) fc.setFiles(cvPath).catch(() => {}); }); // never a native dialog (brief 3.4)
let page = await context.newPage();
wire(page);
const vault = createVault();
installConsoleRedaction(() => secretsCache); // no log line may carry a vault secret
let secretsCache: string[] = await vault.secrets();
const signupTried = new Set<string>();
let codeSubmits = 0, loadRetries = 0, wantLogin = false, loginHelp = '', skipLoginUrl = '';
const authDeps = { escalate: true, vault, email: profile.identite?.email ?? '', local: true, consent: profile.consentements ?? {}, signupTried, runDir,
  careerSite: true,
  accountDecision: (host: string, email: string) => waitForCareerAccountDecision(host, email),
  notify: (m: string) => console.log(`[Agent] ${m}`),
  readEmail: async (hint: string) => { const m = await readEmailCode(context, hint, usedCodes, prune); llmCalls += m.calls; costUsd += m.cost; return m; } };
const opened: Page[] = [page]; // tabs this run opened: closed when the offer does not match

// External career sites (JobTeaser redirects most offers there). Brief 3.5: one account per tenant.
const ATS: [string, RegExp][] = [['workday', /myworkdayjobs\.com|\.workday\.com/], ['greenhouse', /greenhouse\.io/], ['smartrecruiters', /smartrecruiters\.com/], ['lever', /lever\.co/],
  ['taleo', /taleo\.net/], ['successfactors', /successfactors\.(com|eu)/], ['icims', /icims\.com/], ['teamtailor', /teamtailor\.com/], ['welcometothejungle', /welcometothejungle\.com/]];
const siteOf = (u: string) => { const host = new URL(u).hostname; return { host, ats: host.endsWith('jobteaser.com') ? 'jobteaser' : ATS.find(([, re]) => re.test(host))?.[0] ?? 'career_site' }; };
const sites = new Set<string>();
const usedCodes = new Set<string>();
let emailCode: string | undefined;
let offerContext = '';
async function fileFor(input: import('playwright-core').Locator): Promise<string> { // cover-letter inputs get the letter PDF, the others the CV
  const ctxText = await input.evaluate((el) => `${el.getAttribute('aria-label') ?? ''} ${el.id} ${(el as HTMLInputElement).name} ${el.closest('div,fieldset,section,label')?.textContent?.slice(0, 160) ?? ''}`).catch(() => '');
  if (/lettre|cover|motivation/i.test(ctxText) && letterP) { const l = await letterP; if (l.pdf) return l.pdf; }
  return cvPath!;
}
let letterP: Promise<Letter> | undefined; // started on page 1, awaited only when a form asks for a letter

const t0 = Date.now();
let failures = 0, llmCalls = 0, tokIn = 0, tokOut = 0, costUsd = 0, status = 'failed', summary = 'max pages reached';
const pages: { n: number; seconds: number; fields: number; next: string }[] = [];
const track = (r: { tokensIn?: number; tokensOut?: number; costUsd: number }) => { llmCalls++; tokIn += r.tokensIn ?? 0; tokOut += r.tokensOut ?? 0; costUsd += r.costUsd; };

// Custom dropdowns differ per site (ARIA options, listbox items, menu items): look for all of them.
const optionLoc = () => page.locator('[role=option], [role=listbox] li, [role=listbox] [role=presentation], [role=menuitem], [role=treeitem], ul[role=listbox] > *');
const optionByText = (t: string) => optionLoc().filter({ hasText: new RegExp(`^\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
// Returns the visible options when a custom dropdown has no option matching `value` (the caller asks the model to choose).
async function fillField(f: Field): Promise<string[] | void> {
  const l = page.locator(`aria-ref=${f.ref}`);
  if (f.kind === 'password') { // account creation: the password is stored in the vault BEFORE the form is submitted (exact origin key)
    const origin = new URL(page.url()).origin;
    let e = await vault.get(origin);
    if (!e) { await vault.set(origin, { username: profile.identite?.email ?? '', password: generatePassword(), created_by: 'agent' }); e = await vault.get(origin); secretsCache = await vault.secrets(); }
    return l.fill(e!.password, { timeout: 5000 });
  }
  if (f.kind === 'code') {
    if (!emailCode) throw new Error('no email code available');
    return l.fill(f.value || emailCode, { timeout: 5000 }); // f.value = one digit when the page has one box per digit (set before filling)
  }
  if (f.kind === 'text') {
    const [tag, type] = await l.evaluate((e) => [e.tagName, (e as HTMLInputElement).type]).catch(() => ['', '']);
    if (tag !== 'SELECT') { // date inputs take YYYY-MM-DD; a French text field expects DD/MM/YYYY (seen in the replay evaluation)
      const v = type === 'date' ? f.value.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1') : f.value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
      return l.fill(v, { timeout: 5000 });
    }
  }
  if (f.kind === 'check') return l.check({ timeout: 5000 });
  try { await l.selectOption({ label: f.value }, { timeout: 2000 }); return; } catch { /* custom dropdown */ }
  await l.click({ timeout: 5000 });
  let options = (await optionLoc().allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  if (!options.length) { await page.keyboard.type(f.value.slice(0, 30), { delay: 40 }); await sleep(800); options = (await optionLoc().allInnerTexts()).map((t) => t.trim()).filter(Boolean); } // async typeahead (Greenhouse school/location)
  const hit = options.find((o) => o.toLowerCase() === f.value.trim().toLowerCase());
  if (!hit) { await page.keyboard.press('Escape'); return options; }
  await optionByText(hit).click({ timeout: 5000 });
}

await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => { if (!scope.violations.length) throw e; });
let lastState: PageFormState | null = null, stuck = 0;

// Full agent (option 2): takes over a page the fast engine cannot move (see docs/wayfinder/agent-mode). Limits: 12 actions and 0.06 $ per takeover, 0.30 $ per application.
const agentMode = (process.env.AGENT_MODE ?? 'auto') as 'auto' | 'full' | 'off';
const agentStats = { takeovers: 0, turns: 0, actions: 0, cost_usd: 0 };
const agentModel = makeModel(profile);
async function agent(reason: string): Promise<'continue' | 'break' | 'skip'> {
  if (agentMode === 'off' || agentStats.takeovers >= 4 || costUsd >= 0.3) return 'skip';
  console.log(`  [agent] taking over: ${reason}`);
  const origin = page.url();
  if (await page.locator('input[type=password]:visible').count().catch(() => 0) && !(await vault.get(origin)) && siteOf(origin).ats !== 'jobteaser') { // registration form: the password exists before it is typed
    await vault.set(origin, { username: profile.identite?.email ?? '', password: generatePassword(), created_by: 'agent' }); secretsCache = await vault.secrets();
  }
  const entries = (await Promise.all((await vault.list()).map((e) => vault.get(e.origin)))).filter((e): e is NonNullable<typeof e> => !!e);
  const here = await vault.get(origin);
  const r: TakeoverResult = await takeover(page, { model: agentModel, goal: `Make this page of the application advance. Fix the problem described, then click the forward button. Why you were called: ${reason}`,
    facts: JSON.stringify(profile) + JSON.stringify(answers) + offerContext, dryRun: DRY_RUN, cvPath, scopeCheck: (u) => scope.check(u, page.url()), log: (m) => console.log(`  ${m}`),
    mask: (s) => maskSnapshot(prune(s), entries),
    resolveValue: (v) => v.replace('{{vault.password}}', here?.password ?? '').replace('{{email.code}}', emailCode ?? ''),
    readCode: async (hint) => { const m = await readEmailCode(context, hint || site0(), usedCodes, prune); llmCalls += m.calls; costUsd += m.cost; if (m.code) emailCode = m.code; return !!m.code; } });
  agentStats.takeovers++; agentStats.turns += r.turns; agentStats.actions += r.actions; agentStats.cost_usd += r.costUsd; costUsd += r.costUsd; llmCalls += r.turns;
  console.log(`  [agent] ${r.outcome} after ${r.actions} actions, ${r.costUsd.toFixed(4)} $: ${r.summary}`);
  if (r.outcome === 'page_done') { lastState = null; stuck = 0; return 'continue'; }
  if (r.outcome === 'application_ready') { status = 'ready_to_submit'; summary = `agent: ${r.summary}`; return 'break'; }
  if (r.outcome === 'needs_human') { status = 'needs_human'; summary = `agent asks: ${r.summary}`; return 'break'; }
  return 'skip'; // gave up / budget / blocked: the engine's own failure handling decides
}
const site0 = () => siteOf(page.url()).host;

for (let n = 1; n <= MAX_PAGES; n++) {
  const tp = Date.now();
  if (process.env.DEBUG_LOOP) console.log(`  [t+${Math.round((Date.now() - t0) / 1000)}s] page ${n} start ${page.url().slice(0, 80)}`);
  if (scope.violations.length) { status = 'out_of_scope'; summary = scope.violations.at(-1)!; await Promise.all(opened.map((p) => p.close().catch(() => {}))); break; }
  await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
  if (cvPath) { // CV upload without the system dialog (brief 3.4): every empty file input gets the CV, before the model looks at the page
    const files = page.locator('input[type=file]'); const k = await files.count().catch(() => 0);
    for (let i = 0; i < k; i++) if (await files.nth(i).evaluate((el: HTMLInputElement) => !el.files?.length).catch(() => false)) await files.nth(i).setInputFiles(await fileFor(files.nth(i))).catch(() => {});
  }
  // login page: the auth chain handles it (no LLM, no screenshot, no secret anywhere); sign-up forms stay with the batch engine
  const li = detectLoginHtml(await page.content(), page.url());
  if (li.isLogin && !li.isSignup && (!signupTried.has(siteOf(page.url()).host) || wantLogin) && page.url() !== skipLoginUrl) { // after hand-over to the sign-up flow, the engine keeps control unless the site said the account exists
    wantLogin = false;
    authDeps.careerSite = !['jobteaser', 'welcometothejungle'].includes(siteOf(page.url()).ats);
    const r = await login(page, authDeps); secretsCache = await vault.secrets();
    if (r.ok) { lastState = null; continue; }
    if (r.method === 'needsHelp') { loginHelp = r.error ?? ''; skipLoginUrl = page.url(); } else
    if (r.method !== 'needsSignup') { status = 'failed'; summary = `login failed (${r.method}): ${r.error ?? 'no way in'}`; break; }
  }
  for (let k = 0; k < 8 && (await page.ariaSnapshot({ mode: 'ai' }).catch(() => '')).length < 700; k++) await sleep(1500); // redirectors and SPAs render late: an empty tree is not an empty page
  const snapshot = maskSnapshot(prune(await page.ariaSnapshot({ mode: 'ai' })), Object.values(await Promise.all((await vault.list()).map((e) => vault.get(e.origin)))).filter((e): e is NonNullable<typeof e> => !!e));
  safeWrite(`${runDir}/${String(n).padStart(2, '0')}-snapshot.txt`, snapshot, secretsCache);
  if (n === 1) { offerContext = snapshot.slice(0, 6000); letterP = writeLetter(profile, offerContext, runDir).then((l) => { costUsd += l.costUsd; llmCalls++; return l; }).catch((e) => ({ text: '', ask_human: [String(e)], costUsd: 0 })); }
  const formState = await captureFormState(page, snapshot);
  const prog = evaluateProgress(lastState, formState);
  stuck = prog.stuck ? stuck + 1 : 0;
  lastState = formState;
  if (stuck >= 2) { const a = await agent(`the page did not advance after the last 2 actions (${prog.reason ?? 'form state unchanged'})`); if (a === 'continue') continue; if (a === 'break') break; }
  if (stuck >= 3) { status = 'failed'; summary = `stuck: the page did not advance after 3 actions (${prog.reason ?? 'unresolved form'})`; break; }
  const formErr = formState.visibleErrors.length ? `Visible form errors: ${formState.visibleErrors.join(' | ')}.` : '';
  const formReq = formState.emptyRequiredCount ? `Empty required fields remaining: ${formState.emptyRequiredCount}.` : '';
  const formInfo = [formErr, formReq].filter(Boolean).join(' ');
  const helpHint = loginHelp ? `LOGIN FAILED with the saved credentials. The site says: "${loginHelp}". Think: if it suggests the account is not activated / access limited, an activation email was sent: answer need_email_code (reason: the company name). If the account does not exist, create it (register link). Never invent a password.` : ''; loginHelp = '';
  const hint = helpHint || (stuck >= 1 ? `BLOCKED: the page did not advance after the last action. ${formInfo ? `\nDIAGNOSTICS: ${formInfo}` : ''}\nThink: what error or missing step prevents progress (validation error, unfilled required field, dropdown not set)? Include a short "reasoning" and return the fields to fix and the right next action.` : (formInfo ? `FORM DIAGNOSTICS: ${formInfo}` : ''));
  if (hint) console.log(`  [form-state] progress check (stuck=${stuck}) ${formInfo}: asking model`);

  const site = siteOf(page.url());
  const ctx = `${hint}\nCurrent site: ${site.host} (${site.ats})\nAccount: ${(await vault.get(page.url())) ? 'an account exists for this site' : 'no account yet for this site: create one (use the student email; if the site says the account already exists, answer blocked with reason account_exists)'}\nVerification code available: ${emailCode ? 'yes' : 'no'}`;
  if (process.env.DEBUG_LOOP) console.log(`  [t+${Math.round((Date.now() - t0) / 1000)}s] snapshot ${snapshot.length} chars`);
  if (agentMode === 'full') { const a = await agent('AGENT_MODE=full'); if (a === 'continue') continue; if (a === 'break') break; }
  const plan0 = await complete<Plan>({ fixed: FIXED, dynamic: dynamic(snapshot, ctx), schema: hint ? schemaR : schema, effort: hint ? 'high' : 'low' });
  track(plan0);
  let plan = plan0.data;
  if (hint && plan.reasoning) console.log(`  [reflect] ${plan.reasoning}`);
  console.log(`[page ${n}] ${plan.fields.length} fields, ${plan.missing.length} missing, next=${plan.next.action} ${plan.next.label ?? plan.next.reason ?? ''}`);

  if (plan.missing.length) { // ask once (answers are saved for later runs), then re-plan the same page
    if (process.env.NO_ASK) { status = 'needs_human'; summary = `missing: ${plan.missing.map((m) => m.label).join(' | ')}`; break; } // parallel runs cannot prompt
    for (const m of plan.missing) { answers[m.label] = await ask(m.question); writeFileSync(ANSWERS, JSON.stringify(answers, null, 1)); }
    const r2 = await complete<Plan>({ fixed: FIXED, dynamic: dynamic(snapshot, ctx), schema });
    track(r2); plan = r2.data;
  }

  const nx = plan.next;
  if (nx.action === 'need_email_code') { // read the code in Gmail, then plan the SAME page again (it will fill a `code` field)
    const m = await readEmailCode(context, nx.reason ?? site.host, usedCodes, prune);
    llmCalls += m.calls; costUsd += m.cost;
    if (m.error) { status = 'failed'; summary = m.error; break; }
    await page.bringToFront();
    if (m.link && !m.code) { await page.goto(m.link, { waitUntil: 'domcontentloaded' }); }
    emailCode = m.code; lastState = null;
    console.log(`  -> email ${m.code ? 'code' : 'link'} found`);
    continue;
  }
  if (nx.action === 'mismatch') { status = 'not_matching'; summary = `offre ne correspond pas à la recherche: ${nx.reason ?? 'dates ou contrat incompatibles'}`; console.log(`  -> ${summary}`); await page.screenshot({ path: `${runDir}/mismatch.png` }).catch(() => {}); await Promise.all(opened.map((p) => p.close().catch(() => {}))); break; }
  if (nx.action === 'blocked' && /account_exists|already|existe déjà/i.test(nx.reason ?? '')) { // go to the login page: the auth chain will reset the password (if consented) or ask the student
    await page.getByRole('link', { name: /se connecter|connexion|sign in|log in|login/i }).first().click({ timeout: 5000 }).catch(() => {});
    wantLogin = true; lastState = null; continue;
  }
  if (nx.action === 'blocked' && /chargement|loading|vide\b|empty|spinner|skeleton/i.test(nx.reason ?? '') && (loadRetries += 1) <= 4) { console.log(`  [wait] page still loading (${loadRetries}/4)`); await sleep(8000); lastState = null; stuck = 0; continue; }
  if (nx.action === 'blocked' && shouldTakeOver({ mode: agentMode, errorsAfterRepair: 0, stuck, blockedReason: nx.reason })) { const a = await agent(`the engine says blocked: ${nx.reason}`); if (a === 'continue') continue; if (a === 'break') break; }
  if (nx.action === 'blocked') {
    if (/captcha|robot|human/i.test(nx.reason ?? '') && !process.env.NO_ASK) { await ask('Un captcha bloque la page. Résolvez-le dans la fenêtre Chrome puis appuyez sur Entrée.'); lastState = null; continue; }
    status = 'failed'; summary = nx.reason ?? 'blocked'; break;
  }

  // long-form answers: one Sonnet call per page (brief 3.10b: Sonnet writes, Haiku navigates)
  const longs = plan.fields.filter((f) => f.long_form && f.kind === 'text');
  if (longs.length) {
    const w = await complete<{ texts: { label: string; text: string }[] }>({ role: 'writer', fixed: WRITER,
      dynamic: `OFFER (page text):\n${offerContext}\n\nQuestions to answer:\n${JSON.stringify(longs.map((f) => f.label))}`, schema: writerSchema });
    track(w);
    for (const f of longs) f.value = w.data.texts.find((t) => t.label === f.label)?.text ?? '';
    for (const f of longs) if (/lettre|cover letter|motivation letter/i.test(f.label) && letterP) { const l = await letterP; if (l.text) f.value = l.text; if (l.ask_human.length) console.log(`  [letter] needs the student: ${l.ask_human.join(' | ')}`); }
  }

  const pageFails: string[] = [];
  const codeFields = plan.fields.filter((f) => f.kind === 'code');
  if (codeFields.length && emailCode) { await typeCode(page, codeFields.map((f) => f.ref), emailCode).catch((e) => pageFails.push(`could not type the code (${(e as Error).message.split('\n')[0]})`)); plan.fields = plan.fields.filter((f) => f.kind !== 'code'); } // typed once, by the program
  if (codeFields.length && ++codeSubmits > 2) { status = 'needs_human'; summary = 'verification code rejected twice: stopping to avoid locking the account (sites lock after a few attempts)'; break; }
  const pending: { f: Field; options: string[] }[] = [];
  for (const f of plan.fields) {
    try { const opts = await fillField(f); if (opts) pending.push({ f, options: opts }); }
    catch (e) { failures++; pageFails.push(`could not fill "${f.label}" (${(e as Error).message.split('\n')[0]})`); console.log(`  ! could not fill "${f.label}": ${(e as Error).message.split('\n')[0]}`); }
    await human();
  }
  if (pending.length) { // one extra call: pick the exact option text for each dropdown whose options were not known upfront
    const c = await complete<{ choices: { label: string; option: string }[] }>({
      fixed: 'Pick, for each dropdown, the option that matches the student answer (any language). Return the option text EXACTLY as listed.',
      dynamic: JSON.stringify(pending.map((p) => ({ label: p.f.label, student_answer: p.f.value, options: p.options }))), schema: choiceSchema });
    track(c);
    for (const p of pending) {
      const pick = c.data.choices.find((x) => x.label === p.f.label)?.option;
      try {
        if (!pick || !p.options.includes(pick)) throw new Error(`no valid option (${pick})`);
        await page.locator(`aria-ref=${p.f.ref}`).click({ timeout: 5000 });
        await optionByText(pick).click({ timeout: 5000 });
      } catch (e) { failures++; console.log(`  ! could not choose "${p.f.label}": ${(e as Error).message.split('\n')[0]}`); }
      await human();
    }
  }
  // Reflection: re-read the page, and when the site shows validation errors let the model reason about them and fix (max 2 rounds)
  const errLines = (t: string) => t.split('\n').filter((l) => /(obligatoire|required|invalid|invalide|erreur|error|doit être|must be)/i.test(l) && !/champs? identifi|fields? marked|astérisque|asterisk|aria-label|\/url/i.test(l));
  let needsHuman = ''; let remaining = 0;
  for (let fix = 0; fix < 2 && !needsHuman; fix++) {
    const after = maskSnapshot(prune(await page.ariaSnapshot({ mode: 'ai' })), []);
    const domErrs = await page.evaluate(() => [...document.querySelectorAll('[role=alert], [aria-invalid=true], [class*=error i], [class*=invalid i]')].filter((e) => (e as HTMLElement).offsetParent && e.getClientRects().length && (e.textContent ?? '').trim()).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140))).catch(() => [] as string[]);
    const errs = [...new Set([...domErrs.filter(isRealError), ...(fix === 0 ? pageFails : [])])]; // info banners ("code sent") are not errors
    remaining = errs.length;
    if (!errs.length) break;
    console.log(`  [check] ${errs.length} problem(s) after filling: ${errs[0].trim().slice(0, 110)}`);
    const r = await complete<Plan>({ fixed: FIXED, effort: 'high', schema: schemaR, dynamic: dynamic(after, `${ctx}\nVALIDATION ERRORS the page shows after filling. Work out the cause (wrong format, empty field, wrong option) and return only the fields to fix; a value that is truly unknown goes in missing:\n${errs.join('\n')}`) });
    track(r);
    console.log(`  [reflect] ${r.data.reasoning ?? ''}`);
    // never retype a code here: it corrupts one-digit boxes
    for (const f of r.data.fields.filter((x) => x.kind !== 'code')) { try { await fillField(f); } catch (e) { failures++; console.log(`  ! could not fix "${f.label}": ${(e as Error).message.split('\n')[0]}`); } await human(); }
    if (r.data.missing.length) needsHuman = r.data.missing.map((m) => m.label).join(' | ');
    if (!r.data.fields.length) break; // nothing to fix: stop spending on this page
  }
  if (needsHuman) { status = 'needs_human'; summary = `missing after validation: ${needsHuman}`; break; }
  if (shouldTakeOver({ mode: agentMode, errorsAfterRepair: remaining, stuck })) { const a = await agent(`${remaining} validation error(s) remain after the repair round: ${pageFails.join(' | ').slice(0, 300)}`); if (a === 'continue') continue; if (a === 'break') break; }
  await page.screenshot({ path: `${runDir}/${String(n).padStart(2, '0')}-page.png` });
  pages.push({ n, seconds: Math.round((Date.now() - tp) / 1000), fields: plan.fields.length, next: nx.action });

  if (nx.action === 'done') { // only a page that says so counts as sent: the model has called a login page "done" before
    const confirmed = /merci pour votre candidature|candidature (a bien été |a été )?(envoy|reçue|transmise|enregistr)|application (has been )?(submitted|received|sent)|thank you for (applying|your application)/i.test(await page.innerText('body').catch(() => ''));
    status = confirmed ? 'success' : 'failed'; summary = confirmed ? 'application confirmed by the page' : 'the model said "done" but the page shows no confirmation'; break;
  }
  if (testMode() && site.ats === 'jobteaser' && /candidature simplifi/i.test(`${nx.label ?? ''} ${nx.reason ?? ''}`)) { status = 'skipped'; summary = 'JobTeaser simplified application uses the real JobTeaser profile: never with the test identity'; break; }
  const gv = guardAction({ tool: 'click', name: nx.label }, { dryRun: DRY_RUN, onLoginPage: false, facts: '', host: site.host });
  if (!gv.ok) { status = 'failed'; summary = `refused: ${gv.reason}`; console.log(`  [guard] ${summary}`); break; }
  const isFinal = nx.action === 'submit' || FINAL_SUBMIT.test(nx.label ?? '');
  if (isFinal && DRY_RUN) { status = failures ? 'partial' : 'ready_to_submit'; summary = `stopped before "${nx.label}" (DRY_RUN)${failures ? `, ${failures} field(s) NOT filled` : ''}`; break; }
  if (!nx.ref) { summary = 'no next ref'; break; }
  const popup = context.waitForEvent('page', { timeout: 4000 }).catch(() => null); // "Postuler" often opens the external site in a new tab
  await page.locator(`aria-ref=${nx.ref}`).click({ timeout: 8000 }).catch((e) => console.log(`  ! click failed: ${e.message.split('\n')[0]}`));
  const np = await popup;
  if (np) { page = np; opened.push(np); wire(page); await page.waitForLoadState('domcontentloaded').catch(() => {}); console.log(`  -> new tab: ${siteOf(page.url()).host}`); }
  sites.add(`${siteOf(page.url()).host} (${siteOf(page.url()).ats})`);
  await human();
}

const metrics = { scenario, url, status, summary, sites: [...sites], dry_run: DRY_RUN, model: process.env.LLM_FAST_MODEL ?? 'claude-haiku-5-5', llm_calls: llmCalls, agent: agentStats,
  tokens_in: tokIn, tokens_out: tokOut, cost_usd: +costUsd.toFixed(4), total_spent_eur: totalSpentEur(), duration_s: Math.round((Date.now() - t0) / 1000), pages };
writeFileSync(`${runDir}/result.json`, JSON.stringify(metrics, null, 2));
console.log('\n', metrics, `\n-> ${runDir}`);
if (!['ready_to_submit', 'needs_human'].includes(status)) await Promise.all(opened.map((p) => p.close().catch(() => {}))); // only a ready or waiting application keeps its tab open
await browser.close();
