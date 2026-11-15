// Safety net for every outgoing email. TEST_MODE is ON unless explicitly set to "false".
export const TEST_EMAIL = process.env.TEST_EMAIL ?? 'sdfsdfsdfdfsdsfdsf589@gmail.com';
export const testMode = () => process.env.TEST_MODE !== 'false';
export function guardOutgoing(m: { to: string; subject: string }): { to: string; subject: string; redirected: boolean } {
  if (!testMode()) return { ...m, redirected: false };
  return { to: TEST_EMAIL, subject: m.subject.startsWith('[TEST]') ? m.subject : `[TEST] ${m.subject}`, redirected: m.to.toLowerCase() !== TEST_EMAIL.toLowerCase() };
}
