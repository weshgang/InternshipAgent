import type { Page } from 'playwright-core';
import { createHash } from 'node:crypto';

export type PageFormState = {
  url: string;
  hash: string;
  invalidCount: number;
  emptyRequiredCount: number;
  visibleErrors: string[];
  fieldCount: number;
  filledCount: number;
};

// Captures detailed form state beyond a simple snapshot hash:
// Tracks :invalid elements, aria-invalid, empty required fields, and visible validation errors.
export async function captureFormState(page: Page, snapshot: string): Promise<PageFormState> {
  const url = page.url();
  // Strip dynamic clocks, timers, and spinner keywords before hashing to ignore micro-animations
  const cleanSnapshot = snapshot
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
    .replace(/\b(chargement|loading|patientez|spinner|skeleton)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const hash = createHash('md5').update(cleanSnapshot).digest('hex');

  const domState = await page.evaluate(() => {
    // 1. Inputs marked invalid by HTML5 or ARIA
    const invalids = Array.from(document.querySelectorAll(':invalid, [aria-invalid="true"]'));

    // 2. Visible inputs that are required and empty
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
    const requiredEmpty = inputs.filter((el) => {
      const inp = el as HTMLInputElement;
      const rect = inp.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      if (!isVisible) return false;
      const isReq = inp.hasAttribute('required') || inp.getAttribute('aria-required') === 'true';
      const isEmpty = !inp.value?.trim() && !(inp.type === 'checkbox' && inp.checked);
      return isReq && isEmpty;
    });

    // 3. Count filled vs total fillable fields
    let filled = 0;
    let total = 0;
    for (const el of inputs) {
      const inp = el as HTMLInputElement;
      const rect = inp.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && inp.type !== 'submit' && inp.type !== 'button') {
        total++;
        if (inp.type === 'checkbox' || inp.type === 'radio') {
          if (inp.checked) filled++;
        } else if (inp.value && inp.value.trim().length > 0) {
          filled++;
        }
      }
    }

    // 4. Visible error messages
    const errSelectors = '[role="alert"], [aria-errormessage], [class*="error"]:not(body):not(html), [class*="invalid"], [id*="error"]';
    const errorNodes = Array.from(document.querySelectorAll(errSelectors));
    const errors: string[] = [];
    for (const node of errorNodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const text = node.textContent?.trim() || '';
        if (text.length >= 4 && text.length <= 140 && !errors.includes(text)) {
          if (!/script|analytics|tracking/i.test(text)) {
            errors.push(text);
          }
        }
      }
    }

    return {
      invalidCount: invalids.length,
      emptyRequiredCount: requiredEmpty.length,
      visibleErrors: errors.slice(0, 5),
      fieldCount: total,
      filledCount: filled,
    };
  }).catch(() => ({
    invalidCount: 0,
    emptyRequiredCount: 0,
    visibleErrors: [],
    fieldCount: 0,
    filledCount: 0,
  }));

  return {
    url,
    hash,
    ...domState,
  };
}

export function evaluateProgress(prev: PageFormState | null, curr: PageFormState): { stuck: boolean; reason?: string } {
  if (!prev) return { stuck: false };
  // If URL changed, we moved to another page
  if (prev.url !== curr.url) return { stuck: false };

  // If more fields were filled or invalid count decreased, progress was made
  if (curr.filledCount > prev.filledCount || curr.invalidCount < prev.invalidCount) {
    return { stuck: false };
  }

  // 1. Exact snapshot match
  if (prev.hash === curr.hash) {
    return {
      stuck: true,
      reason: curr.visibleErrors.length ? `Erreurs visibles : ${curr.visibleErrors.join(' | ')}` : 'Page et formulaire inchangés',
    };
  }

  // 2. Snapshot changed slightly (animations/spinner) but form state is stagnant and has errors or missing required fields
  if (
    prev.invalidCount === curr.invalidCount &&
    prev.emptyRequiredCount === curr.emptyRequiredCount &&
    curr.filledCount === prev.filledCount &&
    (curr.invalidCount > 0 || curr.visibleErrors.length > 0 || curr.emptyRequiredCount > 0)
  ) {
    const errDetail = curr.visibleErrors.length ? `: ${curr.visibleErrors.join(' | ')}` : '';
    return {
      stuck: true,
      reason: `Formulaire non résolu (${curr.invalidCount} invalide(s), ${curr.emptyRequiredCount} requis vide(s)${errDetail})`,
    };
  }

  return { stuck: false };
}
