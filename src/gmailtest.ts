import 'dotenv/config';
import { connect } from './browser.js';
import { readEmailCode } from './gmail.js';

// Read-only test of the Gmail reader. Usage: npm run gmailtest -- "<sender or keyword>"   e.g. "workday" or "jobteaser"
const hint = process.argv[2] ?? 'code';
const browser = await connect();
const t = Date.now();
const r = await readEmailCode(browser.contexts()[0], hint, new Set(), (x) => x.split('\n').map((l) => (l.length > 220 ? l.slice(0, 140) + '…' + l.slice(-70) : l)).join('\n'));
console.log(r.error ? `FAILED: ${r.error}` : `OK: ${r.code ? `code found (${r.code.length} characters)` : ''}${r.link ? ' link found' : ''}`);
console.log(`${Math.round((Date.now() - t) / 1000)}s, ${r.calls} LLM calls, $${r.cost.toFixed(4)}`);
await browser.close();
