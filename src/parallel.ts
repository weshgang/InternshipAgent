import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Run fill.ts on several offers with N tabs at once (dry-run). Usage: npm run parallel -- <N> [count]
const n = Number(process.argv[2] ?? 3);
const urls: string[] = JSON.parse(readFileSync('offers.json', 'utf8')).slice(0, Number(process.argv[3] ?? n));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Row = { sites?: string[]; url: string; status: string; summary: string; duration_s: number; llm_calls: number; cost_usd: number };
const rows: Row[] = [];
const t0 = Date.now();

function run(url: string): Promise<Row> {
  return new Promise((resolve) => {
    let out = '';
    const c = spawn('npx', ['tsx', 'src/fill.ts', 'par', url], { env: { ...process.env, NO_ASK: '1', DRY_RUN: 'true' } });
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', () => {
      const dir = out.match(/-> (runs\/\S+)/)?.[1];
      try { const r = JSON.parse(readFileSync(`${dir}/result.json`, 'utf8')); resolve({ url, sites: r.sites, status: r.status, summary: r.summary, duration_s: r.duration_s, llm_calls: r.llm_calls, cost_usd: r.cost_usd }); }
      catch { resolve({ url, status: 'crashed', summary: out.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 160), duration_s: 0, llm_calls: 0, cost_usd: 0 }); }
    });
  });
}

// worker pool of size n; starts are staggered 2-5 s apart (human-like, brief 3.8)
let next = 0;
await Promise.all(Array.from({ length: n }, async (_, w) => {
  await sleep(w * (2000 + Math.random() * 3000));
  while (next < urls.length) { const u = urls[next++]; rows.push(await run(u)); await sleep(1000 + Math.random() * 2000); }
}));

console.table(rows.map((r) => ({ offer: r.url.split('/').pop()?.slice(37, 80), status: r.status, sites: (r.sites ?? []).join(' > ').slice(0, 60), s: r.duration_s, llm: r.llm_calls, usd: r.cost_usd, note: r.summary.slice(0, 70) })));
const ok = rows.filter((r) => r.status === 'ready_to_submit').length;
console.log(`concurrency=${n} offers=${urls.length} ready_to_submit=${ok} wall=${Math.round((Date.now() - t0) / 1000)}s cost=$${rows.reduce((a, r) => a + r.cost_usd, 0).toFixed(4)}`);
