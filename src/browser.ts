import { chromium } from 'playwright-core';
import { attachScope } from './scope/allowlist.js';

// Chrome with no open tab refuses Playwright's connection ("Browser context management is not supported"): open a blank one first.
export async function connect() {
  const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223';
  try {
    const tabs = await (await fetch(`${endpoint}/json/list`)).json() as unknown[];
    if (!tabs.length) await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' });
  } catch { /* Chrome not reachable: connectOverCDP below reports it */ }
  const browser = await chromium.connectOverCDP(endpoint);
  for (const c of browser.contexts()) await attachScope(c); // every navigation of every entrypoint goes through the allow-list
  return browser;
}
