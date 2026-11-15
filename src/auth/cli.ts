import 'dotenv/config';
import { createVault } from './vault.js';

// npm run vault:add -- --origin <url> --username <email>   |   npm run vault:list
const arg = (n: string) => process.argv[process.argv.indexOf(`--${n}`) + 1];
const vault = createVault();
if (process.argv[2] === 'list') { console.table(await vault.list()); process.exit(0); }

const origin = arg('origin'), username = arg('username');
if (!origin || !username) { console.error('Usage: npm run vault:add -- --origin <url> --username <email>'); process.exit(1); }
const password = await new Promise<string>((res) => { // masked input: raw mode, nothing echoed
  process.stdout.write('Mot de passe (masqué) : '); let p = '';
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c: string) => { for (const ch of c) {
    if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); return res(p); }
    if (ch === '\u0003') process.exit(1);
    p = ch === '\u007f' ? p.slice(0, -1) : p + ch;
  } });
});
if (!password) { console.error('Mot de passe vide, rien enregistré.'); process.exit(1); }
await vault.set(origin, { username, password, created_by: 'student' });
console.log(`Enregistré pour ${new URL(origin).origin}`);
