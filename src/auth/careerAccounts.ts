import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type CareerAccountDecision = 'existing' | 'create';
export type CareerAccountRecord = {
  host: string;
  email: string;
  decision?: CareerAccountDecision;
  requested_at: string;
  decided_at?: string;
};

const file = () => process.env.CAREER_ACCOUNTS_FILE ?? 'data/career-accounts.json';
const normalizeHost = (host: string) => host.trim().toLowerCase().replace(/:\d+$/, '');
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const keyOf = (host: string, email: string) => `${normalizeHost(host)}|${normalizeEmail(email)}`;

function read(): Record<string, CareerAccountRecord> {
  const f = file();
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, 'utf8')) as Record<string, CareerAccountRecord>; }
  catch { return {}; }
}

function write(records: Record<string, CareerAccountRecord>) {
  const f = file();
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(records, null, 1));
  renameSync(tmp, f);
}

export function careerAccountRecords() {
  return Object.values(read()).sort((a, b) => a.host.localeCompare(b.host));
}

export function getCareerAccountDecision(host: string, email = ''): CareerAccountDecision | undefined {
  const records = read();
  const match = email ? records[keyOf(host, email)] : Object.values(records).find((r) => r.host === normalizeHost(host));
  return match?.decision;
}

export function requestCareerAccount(host: string, email: string): CareerAccountRecord {
  const key = keyOf(host, email);
  const records = read();
  const current = records[key];
  if (current) return current;
  const record: CareerAccountRecord = { host: normalizeHost(host), email, requested_at: new Date().toISOString() };
  records[key] = record;
  write(records);
  return record;
}

export function setCareerAccountDecision(host: string, decision: CareerAccountDecision, email = ''): CareerAccountRecord {
  const records = read();
  const key = email ? keyOf(host, email) : Object.keys(records).find((k) => records[k].host === normalizeHost(host)) ?? keyOf(host, email);
  const current = records[key] ?? { host: normalizeHost(host), email, requested_at: new Date().toISOString() };
  const record = { ...current, decision, decided_at: new Date().toISOString() };
  records[key] = record;
  write(records);
  return record;
}

export async function waitForCareerAccountDecision(host: string, email: string, timeoutMs = 600_000): Promise<CareerAccountDecision | undefined> {
  requestCareerAccount(host, email);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const records = read();
    const decision = records[keyOf(host, email)]?.decision;
    if (decision) return decision;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return undefined;
}
