import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = !existsSync(CHROME) && 'Chrome not installed';
const html = readFileSync('src/ui/index.html', 'utf8');
const at = '2026-11-15T10:00:00.000Z';
const state = { profile: { name: 'Clara Gold' }, offers: [], ranked: [], queue: [], careerAccounts: [], spendEur: 2.08, budgetEur: 20, dryRun: true, testMode: true, running: '', chat: [{ role: 'agent', text: 'salut', at }],
  sessions: { active: 'b2', sessions: [{ id: 'b2', name: 'Sales marchés', created_at: at, updated_at: at }, { id: 'a1', name: 'Marketing digital', created_at: at, updated_at: at }, { id: 'c3', name: 'Audit', created_at: at, updated_at: at }] } };
let browser: Browser; let posts: { path: string; body: string }[] = [];
before(async () => { if (!skip) browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await browser?.close(); });

async function open(confirmAnswer: boolean): Promise<Page> {
  posts = [];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('dialog', (d) => (confirmAnswer ? d.accept() : d.dismiss()));
  await page.route('**/*', (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (p === '/api/state') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) });
    if (p === '/api/preflight') return route.fulfill({ contentType: 'application/json', body: '{"browser":{"ok":true,"name":"Chrome"},"jobteaser":{"ok":true,"name":"JT"},"gmail":{"ok":true,"name":"Gmail"},"linkedin":{"ok":true,"name":"LI"}}' });
    if (req.method() === 'POST') { posts.push({ path: p, body: req.postData() ?? '' }); return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
    return route.abort();
  });
  await page.goto('http://ui.test/'); await page.locator('.av').nth(2).waitFor();
  return page;
}
const sent = () => posts.filter((x) => x.path.startsWith('/api/session')).map((x) => [x.path, JSON.parse(x.body || '{}')]);
const av = (p: Page, name: string) => p.locator('.av', { hasText: name });

test('every search is an avatar, the open one is marked, and nothing is rebuilt by the 2 s refresh', { skip }, async () => {
  const page = await open(true);
  assert.equal(await page.locator('.av').count(), 3); assert.equal(await page.locator('.av.on').innerText().then((t) => t.includes('Sales marchés')), true);
  assert.match(await page.locator('#cur').innerText(), /Sales marchés/);
  await page.click('#manage summary');
  await page.evaluate(() => { (document.querySelector('.av') as any).__same = true; }); // an avatar survives only if the list was not rebuilt
  await page.waitForTimeout(4500);
  assert.equal(await page.evaluate(() => (document.getElementById('manage') as HTMLDetailsElement).open), true);
  assert.equal(await page.evaluate(() => (document.querySelector('.av') as any)?.__same), true); await page.context().close();
});
test('deleting an old search from its avatar asks first, then sends exactly that id; cancelling sends nothing', { skip }, async () => {
  let page = await open(false);
  await av(page, 'Marketing digital').hover(); await av(page, 'Marketing digital').locator('.x').click(); await page.waitForTimeout(400);
  assert.deepEqual(sent(), []); await page.context().close();
  page = await open(true);
  await av(page, 'Marketing digital').hover(); await av(page, 'Marketing digital').locator('.x').click(); await page.waitForTimeout(400);
  assert.deepEqual(sent(), [['/api/session/delete', { id: 'a1' }]]); await page.context().close();
});
test('clicking another avatar opens that search; clicking the open one does nothing', { skip }, async () => {
  const page = await open(true);
  await av(page, 'Sales marchés').click(); await page.waitForTimeout(300); assert.deepEqual(sent(), []);
  await av(page, 'Audit').click(); await page.waitForTimeout(400);
  assert.deepEqual(sent(), [['/api/session/switch', { id: 'c3' }]]); await page.context().close();
});
test('the Gérer menu: clear and delete ask first and target the open search; the open search has no delete cross', { skip }, async () => {
  const page = await open(true);
  assert.equal(await av(page, 'Sales marchés').locator('.x').isVisible(), false);
  await page.click('#manage summary'); await page.getByText('Vider cette recherche').click(); await page.waitForTimeout(400);
  await page.click('#manage summary'); await page.getByText('Supprimer cette recherche').click(); await page.waitForTimeout(400);
  await page.click('#manage summary'); await page.getByText('Supprimer les anciennes').click(); await page.waitForTimeout(400);
  assert.deepEqual(sent(), [['/api/session/clear', {}], ['/api/session/delete', { id: 'b2' }], ['/api/session/delete-others', {}]]); await page.context().close();
});
test('what waits for the student shows in "À valider", with a different colour when it needs them', { skip }, async () => {
  const saved = { chat: state.chat, careerAccounts: state.careerAccounts };
  Object.assign(state, { careerAccounts: [{ host: 'careers.example.com', email: 'a@b.fr' }], chat: [{ role: 'agent', text: 'prêtes', at, type: 'applications', data: [{ offer: 'Stage Sales Taux', status: 'ready_to_submit', summary: 'ok' }, { offer: 'Stage Crédit', status: 'needs_human', summary: 'missing: Genre' }] }] });
  try {
    const page = await open(true); await page.locator('#todo .it').nth(2).waitFor();
    assert.equal(await page.locator('#todo .it').count(), 3); assert.equal(await page.locator('#todo .dot.ask').count(), 2); // account + needs_human; the ready one is not "ask"
    assert.match(await page.locator('#todo').innerText(), /careers\.example\.com/); await page.context().close();
  } finally { Object.assign(state, saved); }
});
