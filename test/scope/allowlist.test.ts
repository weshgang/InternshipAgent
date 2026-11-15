import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scope } from '../../src/scope/allowlist.js';

process.env.JOBTEASER_URL = 'https://dauphine.jobteaser.com';
const JT_OFFER = 'https://dauphine.jobteaser.com/fr/job-offers/561bfda0-f8a8-4f42-80d1-43b25f73ae08-air-liquide';
const ok = (s: Scope, u: string, from?: string) => assert.equal(s.check(u, from).ok, true, `${u} should be allowed`);
const no = (s: Scope, u: string, from?: string) => assert.equal(s.check(u, from).ok, false, `${u} should be blocked`);

test('allowed roots: school JobTeaser, WTTJ, banks', () => {
  const s = new Scope();
  ok(s, 'https://dauphine.jobteaser.com/fr/job-offers'); ok(s, 'https://www.welcometothejungle.com/fr/jobs');
  ok(s, 'https://group.bnpparibas/careers'); ok(s, 'https://bwelcome.hr.bnpparibas/x'); ok(s, 'https://careers.hsbc.com'); ok(s, 'https://www.goldmansachs.com/careers');
});
test('another JobTeaser school and random sites are blocked', () => {
  const s = new Scope();
  no(s, 'https://essec.jobteaser.com/fr/job-offers'); no(s, 'https://example.com'); no(s, 'https://www.google.com/search?q=x');
});
test('direct Greenhouse / Lever / Workday pages are blocked (no allowed origin)', () => {
  const s = new Scope();
  no(s, 'https://job-boards.greenhouse.io/mirakl/jobs/6218264004'); no(s, 'https://jobs.lever.co/brevo/x/apply'); no(s, 'https://acme.wd3.myworkdayjobs.com/en-US/careers');
  no(s, 'https://acme.wd3.myworkdayjobs.com/en-US/careers', 'https://example.com/jobs/1');
});
test('the "Postuler" link of a JobTeaser offer is allowed, then the chain company site -> ATS', () => {
  const s = new Scope();
  ok(s, 'https://carrieres.groupegalerieslafayette.com/offre/1', JT_OFFER);
  ok(s, 'https://galeries.wd3.myworkdayjobs.com/x', 'https://carrieres.groupegalerieslafayette.com/offre/1');
  ok(s, 'https://carrieres.groupegalerieslafayette.com/autre'); // same site afterwards
  no(s, 'https://evil.example.org', 'https://carrieres.groupegalerieslafayette.com/offre/1');
});
test('JobTeaser footer / listing links and social networks are not "Postuler" links', () => {
  const s = new Scope();
  no(s, 'https://some-company.com/careers', 'https://dauphine.jobteaser.com/fr/job-offers'); // listing page
  no(s, 'https://www.facebook.com/jobteaser', JT_OFFER);
});
test('Workday reached from a bank site is allowed, from nowhere is not', () => {
  const s = new Scope();
  ok(s, 'https://bnpparibas.wd3.myworkdayjobs.com/x', 'https://group.bnpparibas/careers/offer/1');
  no(new Scope(), 'https://bnpparibas.wd3.myworkdayjobs.com/x');
});
test('popup with about:blank origin uses the opener; tools and internal pages pass', () => {
  const s = new Scope();
  ok(s, 'https://mail.google.com/mail/u/0/'); ok(s, 'https://www.linkedin.com/search/results/people/'); ok(s, 'about:blank'); ok(s, 'chrome-error://chromewebdata/');
  ok(s, 'https://careers.acme.com/apply', JT_OFFER);
});
test('JobTeaser login page (connect.jobteaser.com) is reachable when the session has expired', () => {
  assert.equal(new Scope().check('https://connect.jobteaser.com/?client_id=x', 'https://dauphine.jobteaser.com/fr/job-offers').ok, true);
});
