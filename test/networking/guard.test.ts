import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardOutgoing, TEST_EMAIL } from '../../src/networking/guard.js';

test('TEST_MODE (default) redirects every recipient and prefixes the subject', () => {
  delete process.env.TEST_MODE;
  const r = guardOutgoing({ to: 'jean.dupont@bank.com', subject: 'Échange sur ton parcours' });
  assert.deepEqual([r.to, r.subject, r.redirected], [TEST_EMAIL, '[TEST] Échange sur ton parcours', true]);
  assert.equal(guardOutgoing({ to: TEST_EMAIL, subject: '[TEST] x' }).subject, '[TEST] x');
  process.env.TEST_MODE = 'true'; assert.equal(guardOutgoing({ to: 'a@b.c', subject: 's' }).to, TEST_EMAIL);
});
test('only an explicit TEST_MODE=false lets a real recipient through', () => {
  process.env.TEST_MODE = 'false';
  assert.deepEqual(guardOutgoing({ to: 'a@b.c', subject: 's' }), { to: 'a@b.c', subject: 's', redirected: false });
  delete process.env.TEST_MODE;
});
