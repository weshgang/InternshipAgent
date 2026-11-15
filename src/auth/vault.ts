import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Encrypted local vault (AES-256-GCM). One entry per exact origin. list() never returns secrets.
export type VaultEntry = { origin: string; username: string; password: string; totpSecret?: string; created_by: 'agent' | 'student'; created_at: string; last_used_at?: string };
type Blob = { v: 1; iv: string; tag: string; data: string };

const SERVICE = 'mvp-agent-vault';
// Strict match: exact origin, no wildcard sub-domain (a look-alike host must never receive a password).
export const originOf = (u: string) => new URL(u).origin;
const safeOrigin = (u: string) => { try { return new URL(u).origin; } catch { return ''; } }; // about:blank and other non-URLs never match an entry

// Key: system keychain first (keytar), else VAULT_KEY (64 hex chars) from .env.
// shortcut: keytar is archived upstream, swap for another keychain binding if it stops building.
export async function loadKey(): Promise<Buffer> {
  try {
    const keytar = (await import('keytar')).default;
    let hex = await keytar.getPassword(SERVICE, 'vault-key');
    if (!hex) { hex = randomBytes(32).toString('hex'); await keytar.setPassword(SERVICE, 'vault-key', hex); }
    return Buffer.from(hex, 'hex');
  } catch { /* no keychain available */ }
  const env = process.env.VAULT_KEY ?? '';
  if (!/^[0-9a-f]{64}$/i.test(env)) throw new Error('no keychain and VAULT_KEY missing: set VAULT_KEY to 64 hex characters (openssl rand -hex 32)');
  return Buffer.from(env, 'hex');
}

export function createVault(opts: { file?: string; key?: Buffer | (() => Promise<Buffer>) } = {}) {
  const file = opts.file ?? 'data/vault.enc.json';
  const key = async () => (Buffer.isBuffer(opts.key) ? opts.key : await (opts.key ?? loadKey)());

  async function read(): Promise<Record<string, VaultEntry>> {
    if (!existsSync(file)) return {};
    const b: Blob = JSON.parse(readFileSync(file, 'utf8'));
    const d = createDecipheriv('aes-256-gcm', await key(), Buffer.from(b.iv, 'base64'));
    d.setAuthTag(Buffer.from(b.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(b.data, 'base64')), d.final()]).toString('utf8'));
  }
  async function write(v: Record<string, VaultEntry>) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', await key(), iv);
    const data = Buffer.concat([c.update(JSON.stringify(v), 'utf8'), c.final()]);
    const blob: Blob = { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(blob)); chmodSync(`${file}.tmp`, 0o600);
    renameSync(`${file}.tmp`, file); // atomic: a crash never leaves a half-written vault
  }

  return {
    get: async (origin: string) => (await read())[safeOrigin(origin)],
    async set(origin: string, e: Omit<VaultEntry, 'origin' | 'created_at'> & { created_at?: string }) {
      const o = originOf(origin); const v = await read();
      v[o] = { ...e, origin: o, created_at: e.created_at ?? new Date().toISOString() };
      await write(v);
    },
    async list() { return Object.values(await read()).map(({ origin, username, created_by }) => ({ origin, username, created_by })); },
    async remove(origin: string) { const v = await read(); delete v[originOf(origin)]; await write(v); },
    async secrets() { return Object.values(await read()).flatMap((e) => [e.password, e.totpSecret].filter((s): s is string => !!s)); }, // for redaction only
  };
}
