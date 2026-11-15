import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleExclusions, briefSummary, type Brief } from '../../src/brief.js';

test('title exclusions come from the brief, else from the legacy targets, else none', () => {
  assert.deepEqual(titleExclusions({ recherche: { mots_exclus_titre: ['audit'] }, cibles: { exclusions: ['rien d\'autre que le PE'] } }), ['audit']);
  assert.deepEqual(titleExclusions({ cibles: { exclusions: ['marketing'] } }), ['marketing']);
  assert.deepEqual(titleExclusions({}), []);
});

test('the chat summary stays short however long the brief is', () => {
  const n = (k: string, i: number) => `${k} ${i}`;
  const big = { objectif: 'x', contrats: ['stage'], lieux: [], coeur: Array.from({ length: 9 }, (_, i) => ({ role: n('coeur', i), signes: '' })), adjacent: Array.from({ length: 9 }, (_, i) => ({ role: n('adj', i), pourquoi: '' })),
    exclu: Array.from({ length: 9 }, (_, i) => ({ fonction: n('excl', i), signes: '' })), titres_trompeurs: [], mots_exclus_titre: [], a_confirmer: [] } as Brief;
  const out = briefSummary(big);
  assert.equal(out.split('\n').length, 4); assert.ok(!out.includes('coeur 3') && out.includes('+6'));
});
