import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { chromium, type Browser, type Page } from 'playwright-core';
import { takeover, type ModelFn, type ModelRequest } from '../../src/agent/loop.js';

// Seam: takeover(page, opts) on a local page with a home-made dropdown, with a scripted model (no network, no real site).
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser: Browser; let server: Server; let base = ''; let sent = 0;
before(async () => {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url === '/next') return void res.end('<h1>Page suivante</h1>');
    if (req.url === '/sent') { sent++; return void res.end('<h1>Envoyé</h1>'); }
    res.end(`<h1>Formulaire</h1><label for=v>Ville</label><input id=v name=ville>
      <div id=dd role=button tabindex=0 onclick="document.getElementById('list').hidden=false">Choisir un pays</div>
      <ul id=list hidden><li onclick="pick('France')">France</li><li onclick="pick('Allemagne')">Allemagne</li></ul>
      <button onclick="location='/next'">Suivant</button><button onclick="location='/sent'">Envoyer ma candidature</button>
      <script>function pick(v){document.getElementById('dd').textContent=v;document.getElementById('list').hidden=true}</script>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => { await browser?.close(); server?.close(); });
const refOf = (snap: string, text: string) => new RegExp(`${text}[^\\n]*\\[ref=(e\\d+)\\]|\\[ref=(e\\d+)\\][^\\n]*${text}`).exec(snap)?.slice(1).find(Boolean) ?? '';
async function newPage(): Promise<Page> { const p = await (await browser.newContext()).newPage(); await p.goto(`${base}/`); return p; }
const base_ = { goal: 'fill the page and go on', facts: '', dryRun: true };

test('the agent works a page with a custom dropdown and hands back once the page changed', async () => {
  const page = await newPage(); let turn = 0;
  const model: ModelFn = async (req: ModelRequest): ReturnType<ModelFn> => {
    turn++;
    if (turn === 1) return { costUsd: 0.001, calls: [{ name: 'fill', input: { ref: refOf(req.snapshot, 'Ville'), value: 'Paris' } }, { name: 'click', input: { ref: refOf(req.snapshot, 'Choisir un pays') } }] };
    if (turn === 2) return { costUsd: 0.001, calls: [{ name: 'click', input: { ref: refOf(req.snapshot, 'France') } }] };
    return { costUsd: 0.001, calls: [{ name: 'click', input: { ref: refOf(req.snapshot, 'Suivant') } }] };
  };
  const r = await takeover(page, { ...base_, model });
  assert.equal(r.outcome, 'page_done'); assert.equal(r.turns, 3); assert.equal(r.actions, 4); assert.ok(Math.abs(r.costUsd - 0.003) < 1e-9);
  assert.match(page.url(), /\/next$/);
});

test('step cap: a model that never succeeds is stopped after the allowed number of actions', async () => {
  const page = await newPage();
  const model: ModelFn = async (req) => ({ costUsd: 0.0001, calls: [{ name: 'click', input: { ref: refOf(req.snapshot, 'Choisir un pays') } }] });
  const r = await takeover(page, { ...base_, model, maxSteps: 4 });
  assert.equal(r.outcome, 'gave_up'); assert.equal(r.actions, 4);
});
test('budget cap: the loop stops as soon as the spend reaches the limit', async () => {
  const page = await newPage();
  const model: ModelFn = async (req) => ({ costUsd: 0.04, calls: [{ name: 'click', input: { ref: refOf(req.snapshot, 'Choisir un pays') } }] });
  const r = await takeover(page, { ...base_, model, budgetUsd: 0.06 });
  assert.equal(r.outcome, 'budget'); assert.equal(r.turns, 2); assert.ok(r.costUsd >= 0.06 && r.costUsd < 0.1);
});
test('guard: the final send button is refused in dry-run, the model is told why, and the page is untouched', async () => {
  const page = await newPage(); sent = 0; let seen: ModelRequest | undefined; let turn = 0;
  const model: ModelFn = async (req) => {
    turn++; seen = req;
    return turn === 1 ? { costUsd: 0, calls: [{ name: 'click', input: { ref: refOf(req.snapshot, 'Envoyer ma candidature') } }] }
      : { costUsd: 0, calls: [{ name: 'finish', input: { status: 'application_ready', summary: 'ready' } }] };
  };
  const r = await takeover(page, { ...base_, model });
  assert.equal(r.outcome, 'application_ready'); assert.equal(sent, 0);
  assert.match(seen!.steps[0].result, /refused.*dry-run/i); assert.match(page.url(), /\/$/);
});
