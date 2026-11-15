import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankOffers, type JudgeFn, type Offer } from '../../src/match.js';

const offers: Offer[] = [
  { id: 'a', title: 'Stage M&A - Analyste H/F' },
  { id: 'b', title: 'Stage - Expert en Finance Durable F/H' },
  { id: 'c', title: "Stage - Chargé d'études F/H" },
  { id: 'd', title: 'Stage Business Analyst' },
];
const exclusions = ['finance durable', 'ESG', 'marketing'];

test('an excluded title is dropped by the code and never reaches the model', async () => {
  const seen: string[] = [];
  const judge: JudgeFn = async (os) => { seen.push(...os.map((o) => o.id)); return os.map((o) => ({ id: o.id, verdict: 'oui', score: 90, reason: 'ok' })); };
  const r = await rankOffers({ offers, exclusions, judge });
  assert.ok(!seen.includes('b'));
  const b = r.all.find((x) => x.id === 'b')!; assert.equal(b.verdict, 'non'); assert.match(b.reason, /finance durable/i);
});
test('pass 2 reads the offers whose title matches or is too vague to place, and its verdict is final; only final "oui" are applied to', async () => {
  const fetched: string[] = [];
  const judge: JudgeFn = async (os, depth) => os.map((o) => depth === 'title'
    ? { id: o.id, verdict: o.id === 'a' ? 'oui' : o.id === 'c' ? 'peut-être' : 'non', score: 50, reason: 'title', open: o.id === 'c' }
    : { id: o.id, verdict: o.id === 'c' ? 'oui' : 'non', score: o.id === 'c' ? 140 : 10, reason: 'full text' });
  const r = await rankOffers({ offers, exclusions, judge, fetchText: async (o) => { fetched.push(o.id); return `texte de ${o.id}`; } });
  assert.deepEqual(fetched.sort(), ['a', 'c']);
  assert.deepEqual(r.toApply.map((x) => x.id), ['c']);
  assert.equal(r.all.find((x) => x.id === 'c')!.score, 100, 'score clamped to 0-100');
  assert.equal(r.all.find((x) => x.id === 'a')!.verdict, 'non', 'a title that looked right but whose text is not M&A is dropped');
});

test('a neighbouring title is never opened and stays "peut-être" for the student; a vague title is read', async () => {
  const fetched: string[] = [];
  const judge: JudgeFn = async (os, depth) => os.map((o) => depth === 'title'
    ? { id: o.id, verdict: 'peut-être', score: 40, reason: 'title', open: o.id === 'c' } // c = "Chargé d'études": too vague to place
    : { id: o.id, verdict: 'oui', score: 90, reason: 'full text' });
  const r = await rankOffers({ offers, exclusions, judge, fetchText: async (o) => { fetched.push(o.id); return 'texte'; } });
  assert.deepEqual(fetched, ['c']);
  assert.equal(r.all.find((x) => x.id === 'a')!.verdict, 'peut-être', 'not opened, left to the student');
  assert.equal(r.all.find((x) => x.id === 'c')!.verdict, 'oui', 'the text settled the vague title');
});
test('a title that matches is opened; an excluded or clearly unrelated one is not', async () => {
  const fetched: string[] = [];
  const judge: JudgeFn = async (os, depth) => os.map((o) => depth === 'title' ? { id: o.id, verdict: o.id === 'a' ? 'oui' : 'non', score: 50, reason: 't', open: true } : { id: o.id, verdict: 'oui', score: 80, reason: 'f' }); // open=true on a "non" must not open it
  await rankOffers({ offers, exclusions, judge, fetchText: async (o) => { fetched.push(o.id); return 'texte'; } });
  assert.deepEqual(fetched, ['a']);
});

test('an offer the student already applied to is "non" and is not judged again', async () => {
  const judge: JudgeFn = async (os) => os.map((o) => ({ id: o.id, verdict: 'oui', score: 90, reason: 'm&a' }));
  const r = await rankOffers({ offers: [offers[0], offers[3]], exclusions, judge, fetchText: async (o) => { if (o.id === 'a') throw new Error('already applied'); return 'texte'; } });
  const a = r.all.find((x) => x.id === 'a')!; assert.equal(a.verdict, 'non'); assert.match(a.reason, /déjà postulé/);
  assert.deepEqual(r.toApply.map((x) => x.id), ['d']);
});
