import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toneFor, guessEmails, nextSlot } from '../../src/networking/core.js';

test('tone: tutoiement up to associate, vouvoiement from VP, unknown -> vous', () => {
  assert.equal(toneFor('Analyst, M&A'), 'tu'); assert.equal(toneFor('Associate - Investment Banking'), 'tu');
  assert.equal(toneFor('Vice President, DCM'), 'vous'); assert.equal(toneFor('Managing Director'), 'vous'); assert.equal(toneFor('Banquier'), 'vous');
});
test('email guesses: ascii, accents removed, common formats', () => {
  assert.deepEqual(guessEmails({ firstName: 'Élodie', lastName: 'Le Gall' }, 'gs.com'), ['elodie.legall@gs.com', 'e.legall@gs.com', 'elodielegall@gs.com', 'elegall@gs.com']);
});
test('send slot: weekday, between 9:10 and 18:30, at least 30 min ahead', () => {
  for (const iso of ['2026-11-14T10:00:00', '2026-11-14T18:00:00', '2026-11-13T22:30:00', '2026-11-16T03:00:00']) {
    const now = new Date(iso), s = nextSlot(now);
    const m = s.getHours() * 60 + s.getMinutes();
    assert.ok(s.getTime() >= now.getTime() + 30 * 60_000 - 1, `${iso} -> ${s}`); assert.ok(![0, 6].includes(s.getDay()), `weekend ${s}`); assert.ok(m >= 9 * 60 + 10 && m <= 18 * 60 + 30, `window ${s}`);
  }
});
