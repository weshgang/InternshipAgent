import { chromium, type Page } from 'playwright-core';
import { appendFileSync } from 'node:fs';

// Read-only observer of the student's own JobTeaser searches in the agent Chrome (no route, no click): logs URL, search text,
// ticked filters and what they click, only when something changes. Usage: npx tsx src/observe.ts  -> runs/observe.log
const LOG = 'runs/observe.log';
const log = (m: string) => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; console.log(l); appendFileSync(LOG, l + '\n'); };
const b = await chromium.connectOverCDP(process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223');
const last = new Map<Page, string>(); const ids = new Map<Page, number>(); let n = 0;
log('observation started (watching JobTeaser & Welcome to the Jungle)');
setInterval(async () => {
  for (const p of b.contexts().flatMap((c) => c.pages())) {
    if (!/jobteaser\.com|welcometothejungle\.com/.test(p.url())) continue;
    if (!ids.has(p)) ids.set(p, ++n);
    const s = await p.evaluate(() => {
      const w = window as unknown as { __obs?: string[] };
      if (!w.__obs) { w.__obs = []; document.addEventListener('click', (e) => { const t = (e.target as HTMLElement).closest('a,button,label,[role=option],[role=checkbox],input,li') as HTMLElement | null; const txt = (t?.innerText || t?.getAttribute('aria-label') || (t as HTMLInputElement)?.value || '').replace(/\s+/g, ' ').trim().slice(0, 80); if (txt) w.__obs!.push(txt); }, true); }
      const clicks = w.__obs.splice(0);
      const q = (document.querySelector('input[placeholder*="Rechercher"], input[data-testid*="search"], input[placeholder*="Product Designer"], input[type=search]') as HTMLInputElement | null)?.value ?? '';
      const ticked = [...document.querySelectorAll('input[type=checkbox]:checked, input[type=radio]:checked, [aria-checked="true"]')].map((i) => (i.closest('label')?.textContent ?? (i as HTMLInputElement).name ?? i.getAttribute('aria-label')).replace(/\s+/g, ' ').trim().slice(0, 40));
      const h1 = document.querySelector('h1, h2')?.textContent?.trim().slice(0, 90) ?? '';
      return { host: location.hostname, url: location.pathname + location.search, q, ticked, h1, clicks };
    }).catch(() => null);
    if (!s) continue;
    const key = JSON.stringify([s.url, s.q, s.ticked]);
    if (key !== last.get(p)) { last.set(p, key); log(`[${s.host} | tab ${ids.get(p)}] ${s.url.slice(0, 110)} | recherche="${s.q}" | filtres=${JSON.stringify(s.ticked)} | titre="${s.h1}"`); }
    for (const c of s.clicks) log(`[${s.host} | tab ${ids.get(p)}]   clic: ${c}`);
  }
}, 1500);
