// Quand l'agent complet prend-il la main ? (ticket « Quand l'agent complet prend-il la main ? »)
export type Signals = { mode: 'auto' | 'full' | 'off'; errorsAfterRepair: number; stuck: number; blockedReason?: string };
const HANDLED = /captcha|robot|offre ferm|closed|account_exists|already|existe d[ée]j|chargement|loading|vide\b|empty/i; // blocked reasons the fast engine already knows how to treat
export function shouldTakeOver(s: Signals): boolean {
  if (s.mode === 'off') return false;
  if (s.mode === 'full') return true;
  if (s.errorsAfterRepair > 0 || s.stuck >= 2) return true;
  return !!s.blockedReason && !HANDLED.test(s.blockedReason);
}
