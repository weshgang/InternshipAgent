import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectLoginHtml } from '../../src/auth/detectLogin.js';

const fx = (n: string) => readFileSync(`test/fixtures/${n}.html`, 'utf8');
test('detect: classic login', () => { const r = detectLoginHtml(fx('login-simple')); assert.ok(r.isLogin && !r.isSignup && !r.loggedInMarker); });
test('detect: two-step login (identifier only)', () => { assert.ok(detectLoginHtml(fx('login-two-step')).isLogin); });
test('detect: sign-up is not a login', () => { const r = detectLoginHtml(fx('signup')); assert.ok(r.isSignup && !r.isLogin); });
test('detect: SSO providers', () => { const r = detectLoginHtml(fx('sso-login')); assert.ok(r.isLogin); assert.deepEqual(r.ssoProviders, ['google', 'linkedin']); });
test('detect: logged-in page ("Déconnexion" is not a login word)', () => { const r = detectLoginHtml(fx('logged-in')); assert.ok(!r.isLogin && r.loggedInMarker); });
test('detect: captcha and ambiguous login URL', () => {
  assert.ok(detectLoginHtml('<input type="password"><div class="g-recaptcha"></div>').captcha);
  assert.ok(detectLoginHtml('<html><body>loading</body></html>', 'https://x.io/sso/start').uncertain);
});
