import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = !existsSync(CHROME) && 'Chrome not installed';
const html = readFileSync('src/ui/index.html', 'utf8');
const at = '2026-11-15T10:00:00.000Z';
const state = { profile: { name: 'Test' }, offers: [], ranked: [], queue: [], careerAccounts: [], spendEur: 0, budgetEur: 20, dryRun: true, testMode: true, running: '', chat: [{ role: 'agent', text: 'salut', at }],
  sessions: { active: 'b2', sessions: [{ id: 'b2', name: 'sales marchés', created_at: at, updated_at: at }, { id: 'a1', name: 'marketing digital', created_at: at, updated_at: at }, { id: 'c3', name: 'audit', created_at: at, updated_at: at }] } };
let browser: Browser; let posts: { path: string; body: string }[] = [];
before(async () => { if (!skip) browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await browser?.close(); });

async function open(confirmAnswer: boolean): Promise<Page> {
  posts = [];
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  page.on('dialog', (d) => (confirmAnswer ? d.accept() : d.dismiss()));
  await page.route('**/*', (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (p === '/api/state') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) });
    if (p === '/api/preflight') return route.fulfill({ contentType: 'application/json', body: '{"browser":{"ok":true,"name":"Chrome"},"jobteaser":{"ok":true,"name":"JT"},"gmail":{"ok":true,"name":"Gmail"},"linkedin":{"ok":true,"name":"LI"}}' });
    if (req.method() === 'POST') { posts.push({ path: p, body: req.postData() ?? '' }); return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
    return route.abort();
  });
  await page.goto('http://ui.test/'); await page.locator('#sesssum').waitFor(); await page.waitForFunction(() => document.getElementById('sesssum')!.textContent!.includes('sales'));
  return page;
}

test('the session panel lists every session and stays open through the 2 s refresh', { skip }, async () => {
  const page = await open(true);
  await page.click('#sesssum'); assert.equal(await page.locator('#sesslist .row').count(), 3);
  await page.evaluate(() => { (document.querySelector('#sesslist .row') as any).__same = true; }); // a row survives only if the list was not rebuilt
  await page.waitForTimeout(4500);
  assert.equal(await page.evaluate(() => (document.getElementById('sessbox') as HTMLDetailsElement).open), true);
  assert.equal(await page.evaluate(() => (document.querySelector('#sesslist .row') as any)?.__same), true); await page.context().close();
});
test('deleting an old session asks first, then sends exactly that id; cancelling sends nothing', { skip }, async () => {
  let page = await open(false); await page.click('#sesssum');
  await page.locator('#sesslist .row', { hasText: 'marketing digital' }).getByText('Supprimer').click(); await page.waitForTimeout(400);
  assert.deepEqual(posts.filter((x) => x.path.startsWith('/api/session')), []); await page.context().close();
  page = await open(true); await page.click('#sesssum');
  await page.locator('#sesslist .row', { hasText: 'marketing digital' }).getByText('Supprimer').click(); await page.waitForTimeout(400);
  const sent = posts.filter((x) => x.path.startsWith('/api/session')); assert.equal(sent.length, 1);
  assert.equal(sent[0].path, '/api/session/delete'); assert.deepEqual(JSON.parse(sent[0].body), { id: 'a1' }); await page.context().close();
});
test('the open session has no "Ouvrir" button; "Ouvrir" on another one switches to it', { skip }, async () => {
  const page = await open(true); await page.click('#sesssum');
  assert.equal(await page.locator('#sesslist .row', { hasText: 'sales marchés' }).getByText('Ouvrir').count(), 0);
  await page.locator('#sesslist .row', { hasText: 'audit' }).getByText('Ouvrir').click(); await page.waitForTimeout(400);
  assert.deepEqual(posts.map((x) => [x.path, JSON.parse(x.body || '{}')]), [['/api/session/switch', { id: 'c3' }]]); await page.context().close();
});
