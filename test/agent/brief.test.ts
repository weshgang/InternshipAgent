import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleExclusions } from '../../src/brief.js';

test('title exclusions come from the brief, else from the legacy targets, else none', () => {
  assert.deepEqual(titleExclusions({ recherche: { mots_exclus_titre: ['audit'] }, cibles: { exclusions: ['rien d\'autre que le PE'] } }), ['audit']);
  assert.deepEqual(titleExclusions({ cibles: { exclusions: ['marketing'] } }), ['marketing']);
  assert.deepEqual(titleExclusions({}), []);
});
