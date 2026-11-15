import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardAction, type Ctx } from '../../src/agent/guard.js';

const ctx = (o: Partial<Ctx> = {}): Ctx => ({ dryRun: true, onLoginPage: false, facts: '', ...o });

test('dry-run: the final send button is refused, a normal "Suivant" is allowed', () => {
  const r = guardAction({ tool: 'click', name: 'Envoyer ma candidature' }, ctx());
  assert.equal(r.ok, false); assert.match((r as { reason: string }).reason, /dry-run/i);
  assert.equal(guardAction({ tool: 'click', name: 'Suivant' }, ctx()).ok, true);
  assert.equal(guardAction({ tool: 'click', name: 'Envoyer ma candidature' }, ctx({ dryRun: false })).ok, true);
});

test('marketing: newsletters, offers and alerts are never ticked; the terms box is', () => {
  for (const name of ['Je souhaite recevoir la newsletter', 'Recevoir les offres de nos partenaires', 'Activer les alertes emploi', 'I agree to receive marketing communications'])
    assert.equal(guardAction({ tool: 'check', name }, ctx()).ok, false, name);
  assert.equal(guardAction({ tool: 'check', name: "J'accepte les conditions générales d'utilisation" }, ctx()).ok, true);
  assert.equal(guardAction({ tool: 'click', role: 'checkbox', name: 'Newsletter' }, ctx()).ok, false);
});

test('login page: no screenshot, and a password is only typed through the vault token', () => {
  assert.equal(guardAction({ tool: 'screenshot' }, ctx({ onLoginPage: true })).ok, false);
  assert.equal(guardAction({ tool: 'screenshot' }, ctx()).ok, true);
  assert.equal(guardAction({ tool: 'fill', name: 'Mot de passe', value: 'Secret123!' }, ctx({ onLoginPage: true })).ok, false);
  assert.equal(guardAction({ tool: 'fill', name: 'Password', value: '{{vault.password}}' }, ctx({ onLoginPage: true })).ok, true);
  assert.equal(guardAction({ tool: 'fill', name: 'Mot de passe', value: 'Secret123!' }, ctx()).ok, false, 'a typed password is refused everywhere');
});

test('scope: a navigation outside the allow-list is refused, one inside is allowed', () => {
  const scopeCheck = (u: string) => (u.includes('jobteaser') ? { ok: true, reason: 'allowed' } : { ok: false, reason: 'site not on the list' });
  assert.equal(guardAction({ tool: 'goto', url: 'https://example.com' }, ctx({ scopeCheck })).ok, false);
  assert.equal(guardAction({ tool: 'goto', url: 'https://dauphine.jobteaser.com/fr/job-offers' }, ctx({ scopeCheck })).ok, true);
});

test('facts: a factual field only takes a value found in the profile, answers or page; free text is not checked', () => {
  const c = ctx({ facts: 'telephone 06 39 98 41 27 email clara@x.fr salaire pas de prétention' });
  assert.equal(guardAction({ tool: 'fill', name: 'Téléphone', value: '06 12 34 56 78' }, c).ok, false);
  assert.equal(guardAction({ tool: 'fill', name: 'Téléphone', value: '06 39 98 41 27' }, c).ok, true);
  assert.equal(guardAction({ tool: 'fill', name: 'Numéro de sécurité sociale', value: '1 85 05 78 006 084 36' }, c).ok, false);
  assert.equal(guardAction({ tool: 'fill', name: 'Pourquoi ce poste ?', value: 'Je veux apprendre.' }, c).ok, true);
});

test('accounts: never log out or touch the account menu; never register on a job board (the student\'s own account lives there)', () => {
  for (const name of ['Se déconnecter', 'Déconnexion', 'Log out', 'Mon compte', 'Supprimer mon compte']) assert.equal(guardAction({ tool: 'click', name }, ctx()).ok, false, name);
  for (const name of ["M'inscrire", 'Inscription', "S'inscrire", 'Créer un compte'])
    assert.equal(guardAction({ tool: 'click', name }, ctx({ host: 'dauphine.jobteaser.com' })).ok, false, name);
  assert.equal(guardAction({ tool: 'click', name: 'Créer un compte' }, ctx({ host: 'natixis.wd3.myworkdayjobs.com' })).ok, true, 'ATS sign-up stays allowed');
});
