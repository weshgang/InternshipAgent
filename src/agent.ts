import 'dotenv/config';
import { chromium, type Page } from 'playwright-core';
import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, Type } from '@google/genai';
import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

// Usage: npm run agent -- <scenario-name> "<task>" [profile.json]
const [scenario = 'test', task = '', profilePath = process.env.PROFILE ?? 'profiles/test-candidate.json'] = process.argv.slice(2);
if (!task) { console.error('Usage: npm run agent -- <scenario> "<task>" [profile.json]'); process.exit(1); }

const MODEL = process.env.LLM_MODEL ?? 'gemini-2.5-flash';
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 40);
const DRY_RUN = process.env.DRY_RUN !== 'false';
const PRICE_IN = Number(process.env.PRICE_IN_PER_M ?? 0.3); // USD per 1M tokens, set to your model's price
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_M ?? 2.5);

const runDir = `runs/${new Date().toISOString().slice(0, 10)}/${scenario}-${Date.now()}`;
mkdirSync(runDir, { recursive: true });

const profile = (() => { try { return readFileSync(profilePath, 'utf8'); } catch { return '{}'; } })();
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const human = () => sleep(300 + Math.random() * 600); // human-like pacing

const str = (d: string) => ({ type: Type.STRING, description: d });
const fn = (name: string, description: string, props: Record<string, unknown> = {}): FunctionDeclaration => ({
  name, description, parameters: { type: Type.OBJECT, properties: props as never, required: Object.keys(props) },
});
const tools: FunctionDeclaration[] = [
  fn('navigate', 'Open a URL', { url: str('URL') }),
  fn('snapshot', 'Accessibility tree of the page with [ref=eN] element refs'),
  fn('click', 'Click an element', { ref: str('ref like e12') }),
  fn('fill', 'Type text in an input', { ref: str('ref'), value: str('text') }),
  fn('select', 'Select an option in a dropdown', { ref: str('ref'), value: str('option label') }),
  fn('upload', 'Upload a file into a file input', { ref: str('ref'), path: str('local file path') }),
  fn('wait', 'Wait', { ms: { type: Type.NUMBER, description: 'milliseconds' } }),
  fn('screenshot', 'Take a screenshot (fallback when snapshot is unclear)'),
  fn('read_email_code', 'Read a verification code from the email inbox', { sender_filter: str('sender substring') }),
  fn('ask_human', 'Ask the student when info is missing or a captcha appears', { question: str('question') }),
  fn('finish', 'End the task', { status: str('success | ready_to_submit | failed'), summary: str('what happened') }),
];

const system = `You are a browser agent applying to job offers for a student. Student profile:\n${profile}\n
Rules: read pages with snapshot (use screenshot only if stuck). Never invent information: if something is missing from the profile or a captcha appears, call ask_human.
${DRY_RUN ? 'DRY RUN: do NOT click the final submit/send button. Fill everything, take a screenshot, then finish with status "ready_to_submit".' : 'Real mode: you may click the final submit button once everything is filled.'}
Every action result already ends with the fresh page snapshot: do not call snapshot again. Batch several independent fill/select calls in ONE turn. For a field whose value is not in the profile (e.g. gender), call ask_human.
Call finish when done or blocked.`;

const loc = (page: Page, ref: string) => page.locator(`aria-ref=${ref}`);
let shot = 0;
const snap = async (page: Page, label: string) =>
  page.screenshot({ path: `${runDir}/${String(++shot).padStart(2, '0')}-${label}.png` });

async function exec(page: Page, name: string, a: Record<string, string>): Promise<string> {
  switch (name) {
    case 'navigate': await page.goto(a.url, { waitUntil: 'domcontentloaded' }); return `ok ${page.url()}`;
    case 'snapshot': return (await page.ariaSnapshot({ mode: 'ai' })).slice(0, 30000); // shortcut: truncation, chunk later
    case 'click': await loc(page, a.ref).click({ timeout: 10000 }); return 'ok';
    case 'fill': await loc(page, a.ref).fill(a.value, { timeout: 10000 }); return 'ok';
    case 'select': await loc(page, a.ref).selectOption({ label: a.value }, { timeout: 10000 }); return 'ok';
    case 'upload': {
      const l = loc(page, a.ref);
      try { await l.setInputFiles(a.path, { timeout: 3000 }); } // real <input type=file>
      catch { await l.click({ timeout: 10000 }); await sleep(1500); } // button: the filechooser handler fills it
      return 'ok';
    }
    case 'wait': await sleep(Math.min(Number(a.ms) || 1000, 15000)); return 'ok';
    case 'screenshot': await snap(page, 'manual'); return `saved in ${runDir}`;
    case 'read_email_code': return 'error: not implemented yet (Gmail tab reader comes with S2)';
    case 'ask_human': {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`\n[Agent asks] ${a.question}\n> `); rl.close(); return answer;
    }
    default: return `error: unknown tool ${name}`;
  }
}

const browser = await chromium.connectOverCDP(process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223');
const context = browser.contexts()[0];
const page = await context.newPage();
// Never let a native file dialog open: any file chooser gets the CV directly.
const cvPath = (JSON.parse(profile).documents ?? {}).cv_fr as string | undefined;
page.on('filechooser', (fc) => { if (cvPath) fc.setFiles(cvPath).catch(() => {}); });
const t0 = Date.now();
let actions = 0, tokIn = 0, tokOut = 0;
let result = { status: 'failed', summary: 'max steps reached' };
const history: Content[] = [{ role: 'user', parts: [{ text: task }] }];

for (let step = 0; step < MAX_STEPS; step++) {
  // keep only the latest page snapshot in history (cost and latency)
  history.slice(0, -1).forEach((h) => h.parts?.forEach((p) => {
    const o = p.functionResponse?.response?.output;
    if (typeof o === 'string' && o.length > 300) p.functionResponse!.response!.output = o.slice(0, 300) + '…[older snapshot omitted]';
  }));
  const res = await ai.models.generateContent({ model: MODEL, contents: history, config: { systemInstruction: system, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, tools: [{ functionDeclarations: tools }] } });
  tokIn += res.usageMetadata?.promptTokenCount ?? 0;
  tokOut += res.usageMetadata?.candidatesTokenCount ?? 0;
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  history.push({ role: 'model', parts });
  const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
  if (!calls.length) { history.push({ role: 'user', parts: [{ text: 'Continue using tools, or call finish.' }] }); continue; }

  const responses = [];
  let done = false;
  for (const c of calls) {
    const args = (c.args ?? {}) as Record<string, string>;
    console.log(`[${step}] ${c.name}`, JSON.stringify(args).slice(0, 120));
    if (c.name === 'finish') { result = { status: args.status, summary: args.summary }; done = true; responses.push({ functionResponse: { name: c.name!, response: { output: 'ok' } } }); continue; }
    let out: string;
    try { out = await exec(page, c.name!, args); } catch (e) { out = `error: ${(e as Error).message.split('\n')[0]}`; }
    if (c.name !== 'snapshot' && c.name !== 'screenshot') { actions++; await snap(page, c.name!).catch(() => {}); await human(); }
    const last = c === calls[calls.length - 1];
    if (last && ['navigate', 'click', 'fill', 'select', 'upload', 'wait'].includes(c.name!) && !out.startsWith('error')) {
      out += '\n--- page ---\n' + (await page.ariaSnapshot({ mode: 'ai' }).catch(() => '')).slice(0, 30000);
    }
    responses.push({ functionResponse: { name: c.name!, response: { output: out } } });
  }
  history.push({ role: 'user', parts: responses });
  if (done) break;
}

await snap(page, 'final').catch(() => {});
const metrics = { scenario, task, ...result, dry_run: DRY_RUN, model: MODEL, browser_actions: actions, tokens_in: tokIn, tokens_out: tokOut,
  cost_usd: +((tokIn * PRICE_IN + tokOut * PRICE_OUT) / 1e6).toFixed(4), duration_s: Math.round((Date.now() - t0) / 1000) };
writeFileSync(`${runDir}/result.json`, JSON.stringify(metrics, null, 2));
console.log('\n', metrics, `\n-> ${runDir}`);
await browser.close();
