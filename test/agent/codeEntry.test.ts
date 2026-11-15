import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright-core';
import { typeCode, isRealError } from '../../src/codeEntry.js';

// Reproduces the Natixis (Oracle) page: 6 single-digit boxes that jump to the next box on input, plus an informational alert.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser: Browser;
before(async () => { browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await browser?.close(); });
const PAGE = `<div role=alert>Le code vérification a été envoyé à l'adresse électronique suivante : a@b.fr.</div>
${[1, 2, 3, 4, 5, 6].map((i) => `<input aria-label="Entrez six pour le chiffre du code de vérification ${i}." maxlength=1 oninput="if(this.value.length>=1&&this.nextElementSibling)this.nextElementSibling.focus()">`).join('')}`;

test('a 6-digit code lands one digit per box, even with auto-advancing boxes', async () => {
  const page = await browser.newPage(); await page.setContent(PAGE);
  const snap = await page.ariaSnapshot({ mode: 'ai' });
  const refs = [...snap.matchAll(/chiffre du code de vérification \d\."? \[ref=(e\d+)\]/g)].map((m) => m[1]);
  assert.equal(refs.length, 6);
  await typeCode(page, refs, '407334');
  assert.equal((await page.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).join(''), '407334');
  await page.close();
});
test('an informational alert is not a validation error; a rejected code is', () => {
  assert.equal(isRealError("Le code vérification a été envoyé à l'adresse électronique suivante : a@b.fr."), false);
  assert.equal(isRealError("Le code n'est pas valide. Entrez un code valide."), true);
  assert.equal(isRealError('Ce champ est obligatoire'), true);
  assert.equal(isRealError('This field is required'), true);
});
