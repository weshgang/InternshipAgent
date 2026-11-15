import type { Page } from 'playwright-core';
import { guardAction } from './guard.js';
import { detectLoginHtml } from '../auth/detectLogin.js';

// Boucle de l'agent complet (prise de relais). Le modèle est injecté : le vrai (Haiku) et le faux des tests ont la même forme.
export type ToolCall = { name: string; input: Record<string, string> };
export type Step = { call: ToolCall; result: string };
export type ModelRequest = { goal: string; steps: Step[]; snapshot: string; image?: Buffer };
export type ModelFn = (req: ModelRequest) => Promise<{ calls: ToolCall[]; costUsd: number }>;
export type Outcome = 'page_done' | 'application_ready' | 'needs_human' | 'blocked' | 'gave_up' | 'budget';
export type TakeoverResult = { outcome: Outcome; turns: number; actions: number; costUsd: number; summary: string };
export type TakeoverOpts = { model: ModelFn; goal: string; facts: string; dryRun: boolean; maxSteps?: number; budgetUsd?: number; cvPath?: string; mask?: (snapshot: string) => string; resolveValue?: (v: string) => string; readCode?: (hint: string) => Promise<boolean>; scopeCheck?: (u: string) => { ok: boolean; reason: string }; log?: (m: string) => void };

// Custom dropdowns differ per site (ARIA options, list items, menu items): look for all of them.
const optionLoc = (page: Page) => page.locator('[role=option], [role=listbox] li, [role=menuitem], [role=treeitem], ul[role=listbox] > *, li');
const loc = (page: Page, ref: string) => page.locator(`aria-ref=${ref}`);
async function describe(page: Page, ref: string): Promise<{ name: string; role: string }> { // accessible name and kind of the target, for the guard
  return loc(page, ref).evaluate((e) => ({ name: (e.getAttribute('aria-label') || (e as HTMLElement).innerText || (e as HTMLInputElement).value || e.getAttribute('name') || '').trim().slice(0, 120),
    role: e.getAttribute('role') || ((e as HTMLInputElement).type === 'checkbox' ? 'checkbox' : e.tagName.toLowerCase()) })).catch(() => ({ name: '', role: '' }));
}

export async function takeover(page: Page, o: TakeoverOpts): Promise<TakeoverResult> {
  const max = o.maxSteps ?? 12, budget = o.budgetUsd ?? 0.06; const steps: Step[] = [];
  let cost = 0, turns = 0, actions = 0; let image: Buffer | undefined;
  const done = (outcome: Outcome, summary: string): TakeoverResult => ({ outcome, turns, actions, costUsd: cost, summary });
  while (actions < max) {
    const raw = (await page.ariaSnapshot({ mode: 'ai' })).slice(0, 24000); const snapshot = o.mask ? o.mask(raw) : raw;
    const turn = await o.model({ goal: o.goal, steps: steps.slice(-8), snapshot, image });
    image = undefined; turns++; cost += turn.costUsd;
    for (const call of turn.calls) {
      if (call.name === 'finish') return done((call.input.status as Outcome) ?? 'blocked', call.input.summary ?? '');
      if (call.name === 'ask_human') return done('needs_human', call.input.question ?? 'the student must answer');
      actions++; const before = page.url(); let result = 'ok';
      const target = call.input.ref ? await describe(page, call.input.ref) : { name: '', role: '' };
      const verdict = guardAction({ tool: call.name as never, name: target.name, role: target.role, value: call.input.value, url: call.input.url },
        { dryRun: o.dryRun, host: (() => { try { return new URL(page.url()).hostname; } catch { return ''; } })(), onLoginPage: detectLoginHtml(await page.content(), page.url()).isLogin, facts: o.facts, scopeCheck: o.scopeCheck });
      if (!verdict.ok) { result = `refused: ${verdict.reason}`; steps.push({ call, result }); o.log?.(`[agent] ${call.name} ${target.name} -> ${result}`); continue; }
      try {
        if (call.name === 'click') await loc(page, call.input.ref).click({ timeout: 6000 });
        else if (call.name === 'fill') await loc(page, call.input.ref).fill(o.resolveValue ? o.resolveValue(call.input.value ?? '') : call.input.value ?? '', { timeout: 6000 });
        else if (call.name === 'check') await loc(page, call.input.ref).check({ timeout: 6000 });
        else if (call.name === 'press') await page.keyboard.press(call.input.key);
        else if (call.name === 'scroll') await page.mouse.wheel(0, call.input.direction === 'up' ? -700 : 700);
        else if (call.name === 'wait') await page.waitForTimeout(Math.min(Number(call.input.ms) || 1000, 10000));
        else if (call.name === 'upload') { if (!o.cvPath) result = 'error: no CV available'; else { const l = loc(page, call.input.ref); try { await l.setInputFiles(o.cvPath, { timeout: 3000 }); } catch { const fc = page.waitForEvent('filechooser', { timeout: 4000 }); await l.click({ timeout: 4000 }); await (await fc).setFiles(o.cvPath); } } }
        else if (call.name === 'screenshot') { image = await page.screenshot(); result = 'ok: the image comes with the next turn'; }
        else if (call.name === 'goto') await page.goto(call.input.url, { waitUntil: 'domcontentloaded' });
        else if (call.name === 'read_email_code') result = o.readCode && await o.readCode(call.input.hint ?? '') ? 'ok: the code is stored, type it with {{email.code}}' : 'error: no verification email found yet; wait and retry once';
        else if (call.name === 'select') {
          const l = loc(page, call.input.ref); const want = call.input.option ?? '';
          try { await l.selectOption({ label: want }, { timeout: 2500 }); } catch {
            await l.click({ timeout: 5000 }); await page.waitForTimeout(500);
            await optionLoc(page).filter({ hasText: new RegExp(`^\\s*${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).first().click({ timeout: 5000 });
          }
        }
        else result = `error: unknown tool ${call.name}`;
      } catch (e) { result = `error: ${(e as Error).message.split('\n')[0]}`; }
      steps.push({ call, result }); o.log?.(`[agent] ${call.name} ${JSON.stringify(call.input).slice(0, 100)} -> ${result.slice(0, 80)}`);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      if (page.url() !== before) return done('page_done', 'the page changed');
    }
    if (cost >= budget) return done('budget', `spend limit reached (${cost.toFixed(3)} $)`);
  }
  return done('gave_up', `no result after ${actions} actions`);
}
