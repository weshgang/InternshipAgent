import 'dotenv/config';
import { connect } from './browser.js';

// Step 0 deliverable: list the open tabs of the agent's Chrome and read the JobTeaser tab title.
let browser;
try { browser = await connect(); } catch (e) {
  console.error(`Cannot connect (${process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9223'}): ${(e as Error).message.split('\n')[0]}\nRun ./chrome-agent.sh (Chrome 136+ needs a dedicated profile for the debugging port)`);
  process.exit(1);
}
const pages = browser.contexts().flatMap((c) => c.pages());
for (const p of pages) console.log(`- ${await p.title()} | ${p.url()}`);
const jt = pages.find((p) => p.url().includes('jobteaser'));
console.log(jt ? `JobTeaser tab: "${await jt.title()}"` : 'No JobTeaser tab open.');
await browser.close();
