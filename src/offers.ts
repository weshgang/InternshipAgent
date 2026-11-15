import 'dotenv/config';
import { connect } from './browser.js';
import { writeFileSync } from 'node:fs';

// Step 3: read the visible JobTeaser or Welcome to the Jungle results page
// (filters already set by the student) -> offers.json {title, company, url, type}.
// type: "simplifiee" (apply inside JobTeaser) or "externe" (link to the recruiter's site); "?" when the card does not say.
// Usage: npm run offers -- [count] [results page url]
export async function readOffers(page: import('playwright-core').Page, count: number) {
  const wttj = /(^|\.)welcometothejungle\.com$/i.test(new URL(page.url()).hostname);
  const sel = wttj
    ? 'a[href*="/companies/"][href*="/jobs/"]'
    : (await page.locator('ul[class*=results]').count()) ? 'ul[class*=results] a[href*="/job-offers/"]' : 'a[href*="/job-offers/"]'; // search results only, not the side blocks
  const raw = await page.$$eval(sel, (as) => as.map((a) => {
    const card = a.closest('li') ?? a.closest('article, [data-testid*="job" i], [class*=card i], [class*=Card]') ?? a.parentElement; // the whole list item
    const lines = (card?.textContent ?? a.textContent ?? '').split('\n').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const heading = card?.querySelector('h1,h2,h3,h4,[role="heading"]')?.textContent ?? a.textContent ?? '';
    return { url: (a as HTMLAnchorElement).href.split('?')[0], title: heading.replace(/\s+/g, ' ').trim(), text: lines.join(' | ').slice(0, 600) };
  }));
  const seen = new Set<string>();
  const offers = raw.filter((o) => /job-offers\/[0-9a-f]{8}-/.test(o.url) && !seen.has(o.url) && seen.add(o.url)).slice(0, count).map((o) => ({
    title: o.title || o.url.split('/').pop()!.slice(37), company: o.text.split(' | ').find((t) => t !== o.title && t.length < 60) ?? '', url: o.url, card: o.text,
    type: /candidature simplifi/i.test(o.text) ? 'simplifiee' : /postuler sur|site (du )?recruteur|externe/i.test(o.text) ? 'externe' : '?',
  }));
  if (!wttj) return offers;
  return raw.filter((o) => /\/companies\/[^/]+\/jobs\//i.test(o.url) && !seen.has(o.url) && seen.add(o.url)).slice(0, count).map((o) => {
    const parts = new URL(o.url).pathname.split('/').filter(Boolean);
    const companySlug = parts[parts.indexOf('companies') + 1] ?? '';
    const company = companySlug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { title: o.title || parts.at(-1)?.replace(/[-_]+/g, ' ') || o.url, company, url: o.url, card: o.text, type: 'externe' as const };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
const count = Number(process.argv[2] ?? 6);
const listUrl = process.argv[3] ?? (process.env.OFFERS_SOURCE === 'wttj'
  ? (process.env.WTTJ_URL ?? 'https://www.welcometothejungle.com/fr/jobs-matches?published_since=last_7d')
  : `${process.env.JOBTEASER_URL ?? 'https://dauphine.jobteaser.com'}/fr/job-offers`);
const browser = await connect();
const page = await browser.contexts()[0].newPage();
await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
const offers = await readOffers(page, count);
writeFileSync('offers.json', JSON.stringify(offers, null, 1));
console.table(offers.map((o) => ({ ...o, url: o.url.slice(-40) })));
await page.close();
await browser.close();
}
