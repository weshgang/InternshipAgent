import { chromium } from 'playwright-core';

export type PreflightService = {
  ok: boolean;
  name: string;
  detail: string;
  url?: string;
  actionUrl?: string;
};

export type PreflightReport = {
  browser: PreflightService;
  jobteaser: PreflightService;
  gmail: PreflightService;
  linkedin: PreflightService;
  timestamp: string;
};

export async function checkPreflight(endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223'): Promise<PreflightReport> {
  const now = new Date().toISOString();
  let versionData: Record<string, string> | null = null;
  let tabs: Array<{ id: string; title: string; url: string; type: string }> = [];

  try {
    const res = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) versionData = await res.json() as Record<string, string>;
  } catch { /* Chrome offline */ }

  if (!versionData) {
    return {
      browser: { ok: false, name: 'Chrome agent', detail: 'Fermé (port 9223 introuvable). Lance ./chrome-agent.sh', actionUrl: '' },
      jobteaser: { ok: false, name: 'JobTeaser', detail: 'Navigateur non démarré' },
      gmail: { ok: false, name: 'Gmail', detail: 'Navigateur non démarré' },
      linkedin: { ok: false, name: 'LinkedIn', detail: 'Navigateur non démarré' },
      timestamp: now,
    };
  }

  try {
    const tRes = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(1500) });
    if (tRes.ok) tabs = await tRes.json() as typeof tabs;
  } catch { /* tabs list failure */ }

  const report: PreflightReport = {
    browser: { ok: true, name: 'Chrome agent', detail: `Actif (port 9223, ${tabs.filter((t) => t.type === 'page').length} onglet(s))` },
    jobteaser: { ok: false, name: 'JobTeaser', detail: 'Vérification...', url: 'https://dauphine.jobteaser.com' },
    gmail: { ok: false, name: 'Gmail', detail: 'Vérification...', url: 'https://mail.google.com' },
    linkedin: { ok: false, name: 'LinkedIn', detail: 'Vérification...', actionUrl: 'https://www.linkedin.com/login' },
    timestamp: now,
  };

  // Inspect cookies via CDP
  try {
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 });
    const ctx = browser.contexts()[0];
    if (ctx) {
      const cookies = await ctx.cookies();

      // 1. JobTeaser
      const jtCookie = cookies.find((c) => c.name.includes('jobteaser_session') || c.name.includes('remember_user_token') || (c.domain.includes('jobteaser') && c.name === 'cf_clearance'));
      const jtTab = tabs.find((t) => t.url.includes('jobteaser.com') && !t.url.includes('/sign_in') && !t.url.includes('connect.jobteaser'));
      if (jtTab || jtCookie) {
        report.jobteaser = { ok: true, name: 'JobTeaser', detail: jtTab ? `Connecté (onglet "${jtTab.title.slice(0, 30)}")` : 'Session active', url: 'https://dauphine.jobteaser.com/fr/job-offers' };
      } else {
        report.jobteaser = { ok: false, name: 'JobTeaser', detail: 'Déconnecté ou session expirée', actionUrl: 'https://dauphine.jobteaser.com/fr/users/sign_in' };
      }

      // 2. Gmail
      const gmailTab = tabs.find((t) => t.url.includes('mail.google.com'));
      const googleAuthCookie = cookies.find((c) => (c.domain.includes('google.com') || c.domain.includes('google.fr')) && ['SID', 'OSID', '__Secure-1PSID'].includes(c.name));
      if (gmailTab || googleAuthCookie) {
        report.gmail = { ok: true, name: 'Gmail', detail: 'Connecté (session active)', url: 'https://mail.google.com' };
      } else {
        report.gmail = { ok: false, name: 'Gmail', detail: 'Non connecté', actionUrl: 'https://mail.google.com' };
      }

      // 3. LinkedIn
      const linkedinTab = tabs.find((t) => t.url.includes('linkedin.com') && !t.url.includes('/login') && !t.url.includes('/authwall') && !t.url.includes('/checkpoint'));
      const liAt = cookies.find((c) => c.domain.includes('linkedin.com') && c.name === 'li_at');
      if (liAt && liAt.value) {
        report.linkedin = { ok: true, name: 'LinkedIn', detail: 'Connecté (session valide)', url: 'https://www.linkedin.com/feed/' };
      } else if (linkedinTab) {
        report.linkedin = { ok: true, name: 'LinkedIn', detail: 'Onglet actif détecté', url: 'https://www.linkedin.com/feed/' };
      } else {
        report.linkedin = { ok: false, name: 'LinkedIn', detail: 'Déconnecté', actionUrl: 'https://www.linkedin.com/login' };
      }
    }
    await browser.close();
  } catch (e) {
    report.browser.detail += ` (cookies indisponibles: ${(e as Error).message.split('\n')[0]})`;
  }

  return report;
}

export async function openInChrome(url: string, endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223'): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    return res.ok;
  } catch {
    return false;
  }
}
