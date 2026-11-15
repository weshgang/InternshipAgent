import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';

// The demo page polls /api/state every 2 s. Regression: every poll rebuilt the chat and jumped to the bottom, so nobody could scroll up.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = !existsSync(CHROME) && 'Chrome not installed';
const html = readFileSync('src/ui/index.html', 'utf8');
const state = { profile: { name: 'Test' }, offers: [], ranked: [], queue: [], careerAccounts: [], spendEur: 0, budgetEur: 20, dryRun: true, testMode: true, running: '',
  chat: Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'student' : 'agent', text: `message ${i}`, at: '' })) as { role: string; text: string; at: string }[] };
let browser: Browser;
before(async () => { if (!skip) browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await browser?.close(); });

async function open(): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  await page.route('**/*', (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (p === '/api/state') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) });
    if (p === '/api/preflight') return route.fulfill({ contentType: 'application/json', body: '{"browser":{"ok":true,"name":"Chrome"},"jobteaser":{"ok":true,"name":"JT"},"gmail":{"ok":true,"name":"Gmail"},"linkedin":{"ok":true,"name":"LI"}}' });
    return route.abort();
  });
  await page.goto('http://ui.test/'); await page.locator('#log .m').nth(39).waitFor();
  return page;
}
const scrollTop = (p: Page) => p.evaluate(() => (document.getElementById('log') as HTMLElement).scrollTop);
const fromBottom = (p: Page) => p.evaluate(() => { const l = document.getElementById('log') as HTMLElement; return l.scrollHeight - l.scrollTop - l.clientHeight; });

test('scrolling up in the conversation is not undone by the 2 s refresh', { skip }, async () => {
  const page = await open();
  await page.evaluate(() => { (document.getElementById('log') as HTMLElement).scrollTop = 0; (document.activeElement as HTMLElement | null)?.blur(); });
  await page.waitForTimeout(4500); // two polls
  assert.equal(await scrollTop(page), 0); await page.context().close();
});
test('a new message still brings a reader at the bottom down to it', { skip }, async () => {
  const page = await open(); assert.ok((await fromBottom(page)) < 5);
  state.chat.push({ role: 'agent', text: 'new message', at: '' });
  await page.waitForTimeout(2600);
  assert.ok((await fromBottom(page)) < 5); assert.equal(await page.locator('#log .m').count(), 41); await page.context().close();
});
