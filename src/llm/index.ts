import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Brief 3.10b: Haiku 5.5 navigates, Sonnet 5.5 writes. Same interface for every backend (3.11); only `api` is implemented.
export type Role = 'fast' | 'writer';
export interface Completion<T> { data: T; tokensIn: number; tokensOut: number; costUsd: number }

// USD per million tokens: [input, output, cache-read]. Haiku 5.5 is pricier above 100k-token prompts (brief 3.10b).
const price = (model: string, promptTokens: number): [number, number, number] =>
  model.includes('haiku') ? (promptTokens > 100_000 ? [0.5, 2.5, 0.05] : [0.1, 0.5, 0.01]) : [2, 10, 0.2];

const SPEND_FILE = 'runs/spend.json';
const EUR_PER_USD = Number(process.env.EUR_PER_USD ?? 0.92); // approximation, set the real rate in .env
const spentEur = (): number => { try { return JSON.parse(readFileSync(SPEND_FILE, 'utf8')).total_eur ?? 0; } catch { return 0; } };
function addSpend(model: string, usd: number) {
  mkdirSync('runs', { recursive: true });
  const s = existsSync(SPEND_FILE) ? JSON.parse(readFileSync(SPEND_FILE, 'utf8')) : { total_eur: 0, by_model: {} };
  s.total_eur = +(s.total_eur + usd * EUR_PER_USD).toFixed(5);
  s.by_model[model] = +((s.by_model[model] ?? 0) + usd * EUR_PER_USD).toFixed(5);
  writeFileSync(SPEND_FILE, JSON.stringify(s, null, 2));
}
export const totalSpentEur = spentEur;

// The API requires additionalProperties:false on every object of a structured-output schema.
const strictify = (n: unknown): unknown => {
  if (Array.isArray(n)) return n.map(strictify);
  if (n && typeof n === 'object') {
    const o = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, strictify(v)]));
    return o.type === 'object' ? { ...o, additionalProperties: false } : o;
  }
  return n;
};

let client: Anthropic | undefined;
/** `fixed` (instructions + profile) is cached; `dynamic` (page, answers) changes every call. */
export async function complete<T>(a: { fixed: string; dynamic: string; schema: object; role?: Role; effort?: 'low' | 'medium' | 'high' }): Promise<Completion<T>> {
  const backend = process.env.LLM_BACKEND ?? 'api';
  if (backend !== 'api') throw new Error(`LLM_BACKEND=${backend} not implemented yet`);
  const budget = Number(process.env.LLM_BUDGET_EUR ?? 20);
  if (spentEur() >= budget) throw new Error(`LLM_BUDGET_EUR reached (${spentEur().toFixed(2)} / ${budget} EUR), stopping`);
  const estTokens = Math.ceil((a.fixed.length + a.dynamic.length) / 3); // shortcut: chars/3 estimate, use countTokens if too coarse
  if (estTokens > 90_000) throw new Error(`prompt too large (~${estTokens} tokens > 90k): prune the snapshot`);

  const model = a.role === 'writer' ? process.env.LLM_WRITER_MODEL ?? 'claude-sonnet-5-5' : process.env.LLM_FAST_MODEL ?? 'claude-haiku-5-5';
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [{ type: 'text', text: a.fixed, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: a.dynamic }],
    output_config: { effort: a.effort ?? (process.env.LLM_EFFORT as 'low' | 'medium' | 'high' | undefined) ?? 'low', format: { type: 'json_schema', schema: strictify(a.schema) as Record<string, unknown> } },
  });
  if (res.stop_reason === 'refusal') throw new Error(`model refused: ${JSON.stringify(res.stop_details)}`);
  if (res.stop_reason === 'max_tokens') throw new Error('output truncated (max_tokens)');
  const u = res.usage;
  const cacheRead = u.cache_read_input_tokens ?? 0, cacheWrite = u.cache_creation_input_tokens ?? 0;
  const [pin, pout, pcache] = price(model, u.input_tokens + cacheRead + cacheWrite);
  const costUsd = (u.input_tokens * pin + cacheWrite * pin * 1.25 + cacheRead * pcache + u.output_tokens * pout) / 1e6;
  addSpend(model, costUsd);
  const text = res.content.find((b) => b.type === 'text');
  return { data: JSON.parse(text && 'text' in text ? text.text : '{}') as T, tokensIn: u.input_tokens + cacheRead + cacheWrite, tokensOut: u.output_tokens, costUsd };
}

/** One stateless agent turn: system + tools + a single user message (text and optionally an image). Same budget, price and spend file as complete(). */
export async function toolTurn(a: { system: string; tools: Anthropic.Messages.Tool[]; text: string; image?: Buffer; effort?: 'low' | 'medium' | 'high'; model?: string }):
  Promise<{ calls: { name: string; input: Record<string, string> }[]; text: string; costUsd: number; tokensIn: number; tokensOut: number }> {
  const budget = Number(process.env.LLM_BUDGET_EUR ?? 20);
  if (spentEur() >= budget) throw new Error(`LLM_BUDGET_EUR reached (${spentEur().toFixed(2)} / ${budget} EUR), stopping`);
  const model = a.model ?? process.env.LLM_FAST_MODEL ?? 'claude-haiku-5-5';
  client ??= new Anthropic();
  const content: Anthropic.Messages.ContentBlockParam[] = [{ type: 'text', text: a.text }];
  if (a.image) content.unshift({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: a.image.toString('base64') } });
  const tools = a.tools.map((t, i) => (i === a.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t)); // cache breakpoint on the last tool
  const res = await client.messages.create({ model, max_tokens: 2048, system: [{ type: 'text', text: a.system, cache_control: { type: 'ephemeral' } }], tools,
    messages: [{ role: 'user', content }], output_config: { effort: a.effort ?? 'high' } });
  const u = res.usage; const cacheRead = u.cache_read_input_tokens ?? 0, cacheWrite = u.cache_creation_input_tokens ?? 0;
  const [pin, pout, pcache] = price(model, u.input_tokens + cacheRead + cacheWrite);
  const costUsd = (u.input_tokens * pin + cacheWrite * pin * 1.25 + cacheRead * pcache + u.output_tokens * pout) / 1e6;
  addSpend(model, costUsd);
  return { calls: res.content.filter((b) => b.type === 'tool_use').map((b) => ({ name: (b as { name: string }).name, input: (b as { input: Record<string, string> }).input })),
    text: res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n'), costUsd, tokensIn: u.input_tokens + cacheRead + cacheWrite, tokensOut: u.output_tokens };
}
