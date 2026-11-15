import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTakeOver, type Signals } from '../../src/agent/trigger.js';

const s = (o: Partial<Signals> = {}): Signals => ({ mode: 'auto', errorsAfterRepair: 0, stuck: 0, ...o });

test('a healthy page stays with the fast engine', () => { assert.equal(shouldTakeOver(s()), false); });
test('a validation error that survives the repair round, or a page unchanged twice, hands over', () => {
  assert.equal(shouldTakeOver(s({ errorsAfterRepair: 1 })), true);
  assert.equal(shouldTakeOver(s({ stuck: 1 })), false);
  assert.equal(shouldTakeOver(s({ stuck: 2 })), true);
});
test('a "blocked" the engine has a rule for (captcha, closed offer, existing account, loading) is not a takeover; an unknown one is', () => {
  for (const blockedReason of ['captcha détecté', 'offre fermée', 'account_exists', 'Page en cours de chargement']) assert.equal(shouldTakeOver(s({ blockedReason })), false, blockedReason);
  assert.equal(shouldTakeOver(s({ blockedReason: "Impossible de choisir une option dans la liste déroulante" })), true);
});
test('modes: "full" always takes over (tests), "off" never does', () => {
  assert.equal(shouldTakeOver(s({ mode: 'full' })), true);
  assert.equal(shouldTakeOver(s({ mode: 'off', stuck: 5, errorsAfterRepair: 3 })), false);
});
