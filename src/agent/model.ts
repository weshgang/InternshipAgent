import { toolTurn } from '../llm/index.js';
import { buildPrompt } from '../prompt.js';
import type { ModelFn } from './loop.js';

// The real model of the agent: Haiku 5.5, high effort, stateless turns (goal + recent actions + fresh page), tools below.
const s = (d: string) => ({ type: 'string' as const, description: d });
const tool = (name: string, description: string, props: Record<string, unknown> = {}) => ({ name, description, input_schema: { type: 'object' as const, properties: props, required: Object.keys(props) } });
export const TOOLS = [
  tool('click', 'Click an element (button, link, checkbox, dropdown, option).', { ref: s('ref like e12') }),
  tool('fill', 'Type text in an input. Passwords: value must be exactly {{vault.password}}; the emailed code: {{email.code}}.', { ref: s('ref'), value: s('text') }),
  tool('select', 'Choose an option in a dropdown (native or custom) by its visible text.', { ref: s('ref of the dropdown'), option: s('visible option text') }),
  tool('check', 'Tick a checkbox or radio.', { ref: s('ref') }),
  tool('press', 'Press a key (Enter, Tab, Escape, ArrowDown...).', { key: s('key name') }),
  tool('upload', 'Attach the student CV to a file input or an upload button.', { ref: s('ref') }),
  tool('scroll', 'Scroll the page to reveal more.', { direction: s('down | up') }),
  tool('wait', 'Wait for the page to load.', { ms: s('milliseconds, max 10000') }),
  tool('screenshot', 'See the page as an image on the next turn. Last resort when the accessibility tree is unclear. Refused on login pages.'),
  tool('goto', 'Open a URL (only the allowed sites).', { url: s('url') }),
  tool('read_email_code', 'Read the verification code that was just emailed to the student; then type it with {{email.code}}.', { hint: s('sender or company') }),
  tool('ask_human', 'Stop and ask the student: a fact is missing from the profile, a captcha appears, or a choice is theirs.', { question: s('question in French') }),
  tool('finish', 'End your turn on this page.', { status: s('page_done (the page advanced or is fully handled) | application_ready (final send button reached, dry-run) | needs_human | blocked'), summary: s('one sentence') }),
];

const PREFACE = `You are now in AGENT MODE: ignore the JSON output format above. Instead, act on the page through the tools. The fast engine could not make this page progress, so look at what is actually on the page and at the previous actions and their results (errors included), find the real cause, and try another way (a custom dropdown may need a click then a click on the option; a covered checkbox may need a dialog closed first; a required field may need a value in another format).
Rules: one to a few tool calls per turn. After a click that changes the page, your work here is done: call finish(page_done). Never click the final send button in dry-run: call finish(application_ready). If a fact is not in the profile or the page, call ask_human. If a call returns "refused: ...", obey the reason and do not retry the same action.`;

export function makeModel(profile: unknown): ModelFn {
  const system = `${buildPrompt(profile)}\n\n${PREFACE}`;
  return async (req) => {
    const hist = req.steps.map((st, i) => `${i + 1}. ${st.call.name} ${JSON.stringify(st.call.input)} -> ${st.result.slice(0, 300)}`).join('\n') || '(none yet)';
    const r = await toolTurn({ system, tools: TOOLS as never, effort: 'high', image: req.image,
      text: `GOAL: ${req.goal}\n\nPREVIOUS ACTIONS ON THIS PAGE:\n${hist}\n\nCURRENT PAGE:\n${req.snapshot}` });
    return { calls: r.calls, costUsd: r.costUsd };
  };
}
