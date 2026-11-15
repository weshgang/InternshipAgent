import type { BrowserContext } from 'playwright-core';

// Strict scope: the agent only navigates where this file allows. Everything else is blocked, logged and reported.
//  1. the school JobTeaser (JOBTEASER_URL) and Welcome to the Jungle;
//  2. bank career sites;
//  3. an ATS (Workday...) or an external career site ONLY when reached from 1 or 2 (or from a site reached that way);
//  4. tools: Gmail / Google sign-in (email codes, SSO) and LinkedIn (networking, read-only).
const root = (host: string, r: string) => host === r || host.endsWith(`.${r}`);
const any = (host: string, roots: string[]) => roots.some((r) => root(host, r));

const WTTJ = ['welcometothejungle.com'];
const BANKS = ['bnpparibas', 'bnpparibas.com', 'societegenerale.com', 'societegenerale.fr', 'socgen.com', 'ca-cib.com', 'credit-agricole.com', 'credit-agricole.fr', 'natixis.com',
  'hsbc.com', 'hsbc.fr', 'jpmorgan.com', 'jpmorganchase.com', 'goldmansachs.com', 'morganstanley.com', 'lazard.com', 'rothschildandco.com', 'rothschild.com'];
const ATS = ['myworkdayjobs.com', 'myworkdaysite.com', 'workday.com', 'greenhouse.io', 'lever.co', 'smartrecruiters.com', 'taleo.net', 'successfactors.com', 'successfactors.eu',
  'icims.com', 'teamtailor.com', 'oraclecloud.com', 'jobvite.com', 'ashbyhq.com', 'recruitee.com', 'personio.com', 'workable.com'];
const TOOLS = ['mail.google.com', 'accounts.google.com', 'linkedin.com', 'login.microsoftonline.com', 'connect.jobteaser.com']; // connect.jobteaser.com: JobTeaser's own login page
const SOCIAL = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com'];
const OFFER_PATH = /\/job-offers\/[0-9a-f]{8}|\/jobs?\/|\/offres?\/|\/companies\/[^/]+\/jobs/i; // an offer page, not a listing or a footer
const registrable = (h: string) => h.split('.').slice(-2).join('.');

export type Verdict = { ok: boolean; reason: string };
export class Scope {
  trusted = new Set<string>(); // hosts reached legitimately in this session
  violations: string[] = [];
  current?: string; // last allowed top-level navigation (fallback origin for popups)
  jobteaser = () => new URL(process.env.JOBTEASER_URL ?? 'https://dauphine.jobteaser.com').hostname;

  /** `from` = URL of the page that triggers the navigation (the opener for a popup). */
  check(url: string, from?: string): Verdict {
    let u: URL; try { u = new URL(url); } catch { return { ok: false, reason: `invalid URL ${url}` }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: true, reason: 'internal page' };
    const host = u.hostname;
    if (any(host, TOOLS)) return { ok: true, reason: 'tool (Gmail / Google sign-in / LinkedIn)' };
    if (host === this.jobteaser() || any(host, WTTJ) || any(host, BANKS)) { this.trusted.add(host); return { ok: true, reason: 'allowed site' }; }
    if (this.trusted.has(host)) return { ok: true, reason: 'site already reached from an allowed one' };
    if (any(host, SOCIAL)) return { ok: false, reason: 'social network' };

    let f: URL | undefined; try { f = from ? new URL(from) : undefined; } catch { /* no usable origin */ }
    if (f && /^https?:$/.test(f.protocol)) {
      const fh = f.hostname;
      const fromBoard = fh === this.jobteaser() || any(fh, WTTJ);
      if (fromBoard && OFFER_PATH.test(f.pathname)) { this.trusted.add(host); return { ok: true, reason: `external link of an offer (${fh})` }; } // the "Postuler" link
      if (!fromBoard && (this.trusted.has(fh) || any(fh, BANKS)) && (any(host, ATS) || registrable(host) === registrable(fh))) { this.trusted.add(host); return { ok: true, reason: `ATS or same company reached from ${fh}` }; }
    }
    return { ok: false, reason: any(host, ATS) ? 'ATS not reached from an allowed site' : 'site not on the list' };
  }
}
export const scope = new Scope();

/** Second net: the first navigation of a popup (window.open) can bypass route(). Every main-frame navigation of every page is checked again,
 * which also records the trust (e.g. offer -> aplitrak.com -> ATS). A forbidden page is closed. */
function watchPages(context: BrowserContext, s: Scope, notify: (m: string) => void) {
  const watch = (page: import('playwright-core').Page, fresh: boolean) => {
    let prev: string | undefined; const opener = page.opener().catch(() => null);
    const handle = async (url: string) => {
      if (url === 'about:blank') return;
      const v = s.check(url, prev ?? (await opener)?.url() ?? s.current);
      if (v.ok) { prev = url; s.current = url; return; }
      const msg = `[SCOPE] blocked ${url} (${v.reason}); stopping. Only JobTeaser, Welcome to the Jungle, bank career sites and links from their offers are allowed.`;
      s.violations.push(msg); notify(msg); await page.close().catch(() => {});
    };
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) void handle(f.url()); });
    if (fresh) void handle(page.url()); // a new popup may already have committed its first URL; tabs that existed before are only watched from now on, never closed
  };
  context.pages().forEach((p) => watch(p, false)); context.on('page', (p) => watch(p, true));
}

/** Blocks every top-level navigation that is not allowed. Iframes and subresources are not navigations. */
export async function attachScope(context: BrowserContext, s = scope, notify: (m: string) => void = (m) => console.error(m)) {
  watchPages(context, s, notify);
  await context.route('**/*', async (route) => {
    const req = route.request();
    if (!req.isNavigationRequest()) return route.fallback();
    let iframe = false; try { iframe = !!req.frame().parentFrame(); } catch { /* popup: frame not created yet, so it is a top-level navigation */ }
    if (iframe) return route.fallback();
    let from: string | undefined;
    try { // a popup's first request can arrive before its frame exists: then fall back to the last allowed page
      const fr = req.frame(); from = fr.url() === 'about:blank' ? undefined : fr.url();
      if (!from) from = (await fr.page()?.opener().catch(() => null))?.url();
    } catch { /* frame not available yet */ }
    from ??= s.current;
    const v = s.check(req.url(), from);
    if (v.ok) { s.current = req.url(); return route.fallback(); }
    const msg = `[SCOPE] blocked ${req.url()} (${v.reason}; from ${from ?? 'unknown'}; trusted: ${[...s.trusted].join(',')}); stopping. Only JobTeaser, Welcome to the Jungle, bank career sites and links from their offers are allowed.`;
    s.violations.push(msg); notify(msg);
    await route.abort('blockedbyclient');
  });
}
