import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { list, create, switchTo, clear, remove, removeOthers, type Paths } from '../../src/ui/sessions.js';

const rd = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
function setup(chat: unknown[] = [{ role: 'student', text: 'stage en sales marchés' }], objectif = 'sales marchés'): Paths {
  const d = mkdtempSync(join(tmpdir(), 'sess-'));
  const p: Paths = { dir: join(d, 'sessions'), chat: join(d, 'chat.json'), ranked: join(d, 'ranked.json'), offers: join(d, 'offers.json'), profile: join(d, 'profile.json') };
  writeFileSync(p.chat, JSON.stringify(chat)); writeFileSync(p.ranked, JSON.stringify([{ id: 'a', verdict: 'oui' }])); writeFileSync(p.offers, JSON.stringify([{ url: 'u' }]));
  writeFileSync(p.profile, JSON.stringify({ identite: { prenom: 'Clara' }, cibles: { objectif, exclusions: ['audit'] }, recherche: { objectif } }));
  return p;
}

test('the first call keeps what the student already has as session 1', () => {
  const p = setup(); const idx = list(p);
  assert.equal(idx.sessions.length, 1); assert.equal(idx.sessions[0].name, 'sales marchés'); assert.equal(rd(p.chat).length, 1);
});
test('a new session starts blank and the old one comes back whole', () => {
  const p = setup(); const first = list(p).active;
  const idx = create(p);
  assert.equal(idx.sessions.length, 2); assert.notEqual(idx.active, first);
  assert.deepEqual(rd(p.chat), []); assert.deepEqual(rd(p.ranked), []); assert.deepEqual(rd(p.offers), []);
  const pr = rd(p.profile); assert.equal(pr.recherche, undefined); assert.equal(pr.cibles.objectif, ''); assert.equal(pr.identite.prenom, 'Clara', 'identity is never part of a session'); assert.deepEqual(pr.cibles.exclusions, ['audit']);
  switchTo(p, first);
  assert.equal(rd(p.chat)[0].text, 'stage en sales marchés'); assert.equal(rd(p.ranked)[0].id, 'a'); assert.equal(rd(p.offers)[0].url, 'u'); assert.equal(rd(p.profile).recherche.objectif, 'sales marchés');
});
test('work done in a session is saved when leaving it', () => {
  const p = setup(); const first = list(p).active; create(p);
  writeFileSync(p.chat, JSON.stringify([{ role: 'student', text: 'autre recherche' }])); writeFileSync(p.profile, JSON.stringify({ ...rd(p.profile), recherche: { objectif: 'marketing digital' } }));
  switchTo(p, first); const back = switchTo(p, list(p).sessions.find((s) => s.id !== first)!.id);
  assert.equal(rd(p.chat)[0].text, 'autre recherche'); assert.equal(back.sessions.find((s) => s.id === back.active)!.name, 'marketing digital');
});
test('clearing the cache empties the open session only', () => {
  const p = setup(); const first = list(p).active; create(p); writeFileSync(p.chat, JSON.stringify([{ role: 'student', text: 'x' }]));
  const idx = clear(p);
  assert.deepEqual(rd(p.chat), []); assert.equal(idx.sessions.length, 2); assert.equal(idx.sessions.find((s) => s.id === idx.active)!.name, 'Nouvelle recherche');
  switchTo(p, first); assert.equal(rd(p.chat)[0].text, 'stage en sales marchés');
});
test('deleting an old session removes its files; deleting the open one opens another; the last one leaves a blank session', () => {
  const p = setup(); const first = list(p).active; const second = create(p).active;
  const afterOld = remove(p, first); assert.equal(afterOld.sessions.length, 1); assert.ok(!existsSync(join(p.dir, first)));
  const afterLast = remove(p, second); assert.equal(afterLast.sessions.length, 1); assert.notEqual(afterLast.active, second); assert.deepEqual(rd(p.chat), []);
});
test('deleting the open session loads the most recent other one', () => {
  const p = setup(); const first = list(p).active; create(p);
  const idx = remove(p, list(p).active); assert.equal(idx.active, first); assert.equal(rd(p.chat)[0].text, 'stage en sales marchés');
});
test('"delete the old ones" keeps only the open session', () => {
  const p = setup(); list(p); create(p); const open = create(p).active;
  const idx = removeOthers(p); assert.deepEqual(idx.sessions.map((s) => s.id), [open]);
});
test('an id from the network can never leave the sessions folder', () => {
  const p = setup(); list(p);
  for (const bad of ['../x', '..', 'a/b', '', 'zzzzzzzzzzzzzzzzzzzz', 7, undefined]) { assert.throws(() => remove(p, bad)); assert.throws(() => switchTo(p, bad)); }
  assert.ok(existsSync(p.chat));
});
test('a session is named by the short title of its brief when it has one', () => {
  const p = setup(); writeFileSync(p.profile, JSON.stringify({ cibles: { objectif: 'x' }, recherche: { titre: 'Sales marchés', objectif: 'Trouver un stage en finance de marché, au poste de Sales' } }));
  assert.equal(list(p).sessions[0].name, 'Sales marchés');
});
