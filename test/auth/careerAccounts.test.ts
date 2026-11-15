import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { careerAccountRecords, getCareerAccountDecision, requestCareerAccount, setCareerAccountDecision } from '../../src/auth/careerAccounts.js';

test('career account choice is persisted per host without storing a password', () => {
  const previous = process.env.CAREER_ACCOUNTS_FILE;
  process.env.CAREER_ACCOUNTS_FILE = join(mkdtempSync(join(tmpdir(), 'career-accounts-')), 'accounts.json');
  try {
    const pending = requestCareerAccount('SocGen.Taleo.net:443', 'student@example.com');
    assert.equal(pending.host, 'socgen.taleo.net');
    assert.equal(pending.email, 'student@example.com');
    assert.equal(getCareerAccountDecision('socgen.taleo.net'), undefined);

    const decided = setCareerAccountDecision('socgen.taleo.net', 'create', 'student@example.com');
    assert.equal(decided.decision, 'create');
    assert.equal(getCareerAccountDecision('SOCGEN.TALEO.NET'), 'create');
    assert.equal(getCareerAccountDecision('socgen.taleo.net', 'other@example.com'), undefined);
    assert.deepEqual(careerAccountRecords().map(({ host, email, decision }) => ({ host, email, decision })), [
      { host: 'socgen.taleo.net', email: 'student@example.com', decision: 'create' },
    ]);
  } finally {
    if (previous === undefined) delete process.env.CAREER_ACCOUNTS_FILE;
    else process.env.CAREER_ACCOUNTS_FILE = previous;
  }
});
