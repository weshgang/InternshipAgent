import type { Page } from 'playwright-core';

// Emailed verification codes, typed by the program (never by the model).
// One box per digit (Oracle, Workday...): clear the boxes, then type the digits from the first box, the way a person does,
// so sites that move the focus on input keep the order. One box: fill it.
export async function typeCode(page: Page, refs: string[], code: string): Promise<void> {
  const boxes = refs.map((r) => page.locator(`aria-ref=${r}`));
  if (boxes.length === 1) return boxes[0].fill(code, { timeout: 5000 });
  for (const b of boxes) await b.fill('', { timeout: 5000 });
  if (boxes.length === code.length) { for (let i = 0; i < code.length; i++) await boxes[i].pressSequentially(code[i], { delay: 60 }); return; }
  await boxes[0].click({ timeout: 5000 }); await page.keyboard.type(code, { delay: 80 }); // box count unknown: rely on the site's auto-advance
}

// Only messages that say something is wrong count as validation errors ("code sent", "info" banners do not).
export const isRealError = (t: string) => /obligatoire|requis|required|invalide?|n'est pas valide|incorrect|erreur|error|must be|doit être|manquant|missing/i.test(t);
