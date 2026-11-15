// Garde-fous du mode agent : appliqués par le code qui exécute les actions, quoi que décide le modèle (ticket « Quels garde-fous le code impose-t-il à l'agent ? »).
export type Action = { tool: 'click' | 'fill' | 'select' | 'check' | 'press' | 'upload' | 'screenshot' | 'goto' | 'ask_human' | 'finish'; name?: string; role?: string; value?: string; url?: string };
export type Ctx = { dryRun: boolean; onLoginPage: boolean; facts: string; host?: string; scopeCheck?: (url: string) => { ok: boolean; reason: string } };
export type Verdict = { ok: true } | { ok: false; reason: string };

const FINAL_SUBMIT = /envoyer (ma|la) candidature|soumettre|submit|send application|finaliser/i; // same words as the fast engine
const MARKETING = /newsletter|marketing|offres?( commerciales?)? (de nos )?partenaires|alertes?( emploi)?|job alerts?|promotions?|actualit[ée]s|communications? commerciales?|receive .*(offers|updates)/i;
const FACTUAL = /iban|num[ée]ro|number|date de naissance|birth|s[ée]curit[ée] sociale|social security|passeport|passport|salaire|salary|t[ée]l[ée]phone|phone|mobile|adresse|address|code postal|zip/i;
const norm = (t: string) => t.toLowerCase().replace(/[\s.\-()]/g, '');
const ACCOUNT = /d[ée]connex|se d[ée]connecter|log ?out|sign ?out|mon compte|my account|supprimer (mon|le) compte|delete (my )?account/i;
const SIGNUP = /m'inscrire|inscription|s'inscrire|cr[ée]er (un|mon) compte|sign ?up|register/i;
const JOB_BOARD = /(^|\.)jobteaser\.com$|(^|\.)welcometothejungle\.com$/;
const no = (reason: string): Verdict => ({ ok: false, reason });

export function guardAction(a: Action, c: Ctx): Verdict {
  if (a.tool === 'click' && c.dryRun && FINAL_SUBMIT.test(a.name ?? '')) return no('dry-run: the final send button is never clicked; call finish(application_ready) instead');
  if ((a.tool === 'check' || (a.tool === 'click' && a.role === 'checkbox')) && MARKETING.test(a.name ?? '')) return no('marketing, newsletter and alert boxes are never ticked');
  if (a.tool === 'screenshot' && c.onLoginPage) return no('no screenshot on a login page');
  if (a.tool === 'fill' && /password|mot de passe/i.test(a.name ?? '') && !/^\{\{vault\.password\}\}$/.test(a.value ?? '')) return no('passwords are only typed through the {{vault.password}} token');
  if (a.tool === 'goto' && c.scopeCheck) { const v = c.scopeCheck(a.url ?? ''); if (!v.ok) return no(`outside the allowed sites: ${v.reason}`); }
  if (a.tool === 'fill' && FACTUAL.test(a.name ?? '') && a.value && !norm(c.facts).includes(norm(a.value))) return no(`"${a.name}" asks for a fact that is not in the profile, the answers or the page: call ask_human`);
  if (a.tool === 'click' && ACCOUNT.test(a.name ?? '')) return no('the account menu, logout and account deletion are off-limits');
  if (a.tool === 'click' && JOB_BOARD.test(c.host ?? '') && SIGNUP.test(a.name ?? '')) return no('never register on the job board: the student uses their own account there');
  return { ok: true };
}
