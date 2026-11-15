import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Step 3: apply to the offers of offers.json one after the other (human pace, quota). Usage: npm run batch -- [max=5]
// One child process per offer (fill.ts): a crash or a blocked page never stops the batch.
const max = Math.min(Number(process.argv[2] ?? 5), Number(process.env.QUOTA_APPLICATIONS ?? 5)); // demo quota: 5
type Offer = string | { url: string; title?: string; company?: string };
const offers: Offer[] = JSON.parse(readFileSync('offers.json', 'utf8')).slice(0, max);
const pause = () => new Promise((r) => setTimeout(r, 2000 + Math.random() * 4000)); // 2-6 s
const rows: Record<string, unknown>[] = [];
for (const [i, o] of offers.entries()) {
  const url = typeof o === 'string' ? o : o.url;
  console.log(`\n=== offer ${i + 1}/${offers.length}: ${typeof o === 'string' ? url.slice(-60) : `${o.title} (${o.company})`}`);
  const out = await new Promise<string>((res) => {
    let buf = ''; const p = spawn('npx', ['tsx', 'src/fill.ts', `batch${i + 1}`, url], { env: process.env });
    p.stdout.on('data', (d) => { buf += d; process.stdout.write(d); }); p.stderr.on('data', (d) => process.stderr.write(d)); const kill = setTimeout(() => { buf += '\n[batch] timeout 300 s, killed\n'; p.kill('SIGKILL'); }, Number(process.env.OFFER_TIMEOUT_S ?? 300) * 1000);
    p.on('close', () => { clearTimeout(kill); res(buf); });
  });
  const dir = /-> (runs\/\S+)/.exec(out)?.[1];
  const r = dir ? JSON.parse(readFileSync(`${dir}/result.json`, 'utf8')) : { status: 'failed', summary: 'no result' };
  rows.push({ offer: typeof o === 'string' ? url.slice(-40) : o.title, status: r.status, summary: String(r.summary).slice(0, 90), llm_calls: r.llm_calls, cost_usd: r.cost_usd, seconds: r.duration_s, run: dir });
  if (i < offers.length - 1) await pause();
}
console.table(rows);
mkdirSync('runs', { recursive: true });
writeFileSync(`runs/batch-${Date.now()}.json`, JSON.stringify(rows, null, 2));
