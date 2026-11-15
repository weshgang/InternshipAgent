import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Search sessions. A session = the chat, the ranked offers, the shortlist and the search brief of ONE search.
// The active session lives in the working files every script already reads (chat, ranked, offers, profile.recherche);
// the others are archived under <dir>/<id>/. Switching = archive the active one, then load the other into the working files.
// Never part of a session: identity, CV, vault, login-attempt budget, networking queue (sent emails), run artifacts.
export type Paths = { dir: string; chat: string; ranked: string; offers: string; profile: string };
export type SessionMeta = { id: string; name: string; created_at: string; updated_at: string };
type Index = { active: string; sessions: SessionMeta[] };
type Search = { recherche?: unknown; objectif?: string };

const FILES: [keyof Paths, string][] = [['chat', 'chat.json'], ['ranked', 'ranked.json'], ['offers', 'offers.json']];
const readJson = <T,>(f: string, d: T): T => { try { return JSON.parse(readFileSync(f, 'utf8')) as T; } catch { return d; } };
const writeJson = (f: string, v: unknown) => writeFileSync(f, JSON.stringify(v, null, 2));
const idOk = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9]{1,16}$/.test(id); // the id comes from the HTTP body and becomes a path
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const index = (p: Paths) => `${p.dir}/index.json`;

function readSearch(p: Paths): Search { const pr = readJson<any>(p.profile, {}); return { recherche: pr.recherche, objectif: pr.cibles?.objectif }; }
function writeSearch(p: Paths, s: Search) {
  const pr = readJson<any>(p.profile, {});
  if (s.recherche) pr.recherche = s.recherche; else delete pr.recherche;
  pr.cibles = { ...pr.cibles, objectif: s.objectif ?? '' };
  writeJson(p.profile, pr);
}
const nameOf = (s: Search) => String((s.recherche as { objectif?: string } | undefined)?.objectif ?? s.objectif ?? '').slice(0, 60) || 'Nouvelle recherche';

/** Working files -> <dir>/<id>/ */
function archive(p: Paths, id: string) {
  mkdirSync(`${p.dir}/${id}`, { recursive: true });
  for (const [k, f] of FILES) if (existsSync(p[k])) cpSync(p[k], `${p.dir}/${id}/${f}`); else rmSync(`${p.dir}/${id}/${f}`, { force: true });
  writeJson(`${p.dir}/${id}/search.json`, readSearch(p));
}
/** <dir>/<id>/ -> working files (an empty session writes empty files) */
function load(p: Paths, id: string) {
  for (const [k, f] of FILES) { const src = `${p.dir}/${id}/${f}`; if (existsSync(src)) cpSync(src, p[k]); else writeJson(p[k], []); }
  writeSearch(p, readJson<Search>(`${p.dir}/${id}/search.json`, {}));
}
const blank = (p: Paths) => { for (const [k] of FILES) writeJson(p[k], []); writeSearch(p, {}); };

/** First call migrates what is already in the working files into "session 1", so nothing the student has is lost. */
export function list(p: Paths): Index {
  mkdirSync(p.dir, { recursive: true });
  const idx = readJson<Index | null>(index(p), null);
  if (idx?.sessions.length) { const cur = idx.sessions.find((x) => x.id === idx.active); if (cur) cur.name = nameOf(readSearch(p)); return idx; } // the open session's name follows its brief
  const id = newId(); const now = new Date().toISOString();
  const first: Index = { active: id, sessions: [{ id, name: nameOf(readSearch(p)), created_at: now, updated_at: now }] };
  writeJson(index(p), first); return first;
}
const save = (p: Paths, idx: Index) => { // keep the active session's name and date up to date from the working files
  const cur = idx.sessions.find((s) => s.id === idx.active)!; cur.name = nameOf(readSearch(p)); cur.updated_at = new Date().toISOString(); writeJson(index(p), idx);
};

export function create(p: Paths): Index {
  const idx = list(p); save(p, idx); archive(p, idx.active);
  const id = newId(); const now = new Date().toISOString(); blank(p);
  idx.sessions.unshift({ id, name: 'Nouvelle recherche', created_at: now, updated_at: now }); idx.active = id; writeJson(index(p), idx); return idx;
}
export function switchTo(p: Paths, id: unknown): Index {
  const idx = list(p); if (!idQ(idx, id)) throw new Error('session inconnue'); if (id === idx.active) return idx;
  save(p, idx); archive(p, idx.active); load(p, id); idx.active = id; writeJson(index(p), idx); return idx;
}
/** "Delete the session's cache": the active session keeps its place in the list but loses its chat, offers and brief. */
export function clear(p: Paths): Index { const idx = list(p); blank(p); save(p, idx); return idx; }

export function remove(p: Paths, id: unknown): Index {
  const idx = list(p); if (!idQ(idx, id)) throw new Error('session inconnue');
  rmSync(`${p.dir}/${id}`, { recursive: true, force: true }); idx.sessions = idx.sessions.filter((s) => s.id !== id);
  if (id === idx.active) { // the deleted one was open: open the most recent other one, or a blank one when it was the last
    const next = idx.sessions[0];
    if (next) { load(p, next.id); idx.active = next.id; } else { blank(p); const now = new Date().toISOString(); const nid = newId(); idx.sessions.push({ id: nid, name: 'Nouvelle recherche', created_at: now, updated_at: now }); idx.active = nid; }
  }
  writeJson(index(p), idx); return idx;
}
/** Delete every session except the open one. */
export function removeOthers(p: Paths): Index {
  const idx = list(p); for (const s of idx.sessions) if (s.id !== idx.active) rmSync(`${p.dir}/${s.id}`, { recursive: true, force: true });
  idx.sessions = idx.sessions.filter((s) => s.id === idx.active); writeJson(index(p), idx); return idx;
}
const idQ = (idx: Index, id: unknown): id is string => idOk(id) && idx.sessions.some((s) => s.id === id);
