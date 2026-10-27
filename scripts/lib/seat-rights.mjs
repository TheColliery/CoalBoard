// R15 (items 1 and 2): the board's per-seat tool rights, parsed from the two places that state them and checked
// against each other. SKILL.md's "Seat permissions" ledger is the authority (P19: grant every seat exactly its row);
// agents/cb-*.md `tools:` is what the platform ENFORCES on Claude Code. A new duty (run safety) or a widened source
// set (live databases, an alert brief) must add NO right to any seat, so both gates call this to prove it.
const SHELL_TOOLS = ['Bash', 'PowerShell'];
const FETCH_TOOLS = ['WebFetch', 'WebSearch'];
const READ_TOOLS = ['Read', 'Grep', 'Glob'];
const NEVER_GRANTED = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Agent', 'Task', 'Workflow'];

// `| **data** (sub1 empirical) | ✔ | ✖ | ✔ |` -> { data: { read: true, run: false, fetch: true } }
export function parseSeatLedger(skillText) {
  const seats = {};
  for (const line of skillText.split('\n')) {
    const m = /^\|\s*\*\*([^*]+)\*\*[^|]*\|\s*([✔✖])\s*\|\s*([✔✖])\s*\|\s*([✔✖])\s*\|/u.exec(line);
    if (!m) continue;
    const name = /observer/i.test(m[1]) ? 'observer' : m[1].trim().split(/\s+/)[0].toLowerCase();
    seats[name] = { read: m[2] === '✔', run: m[3] === '✔', fetch: m[4] === '✔' };
  }
  return seats;
}

// agents/cb-<seat>.md frontmatter -> { data: ['Read', ...] }. Two spellings carry the same rights: the comma string
// `tools: A, B, C` (Claude Code) and a YAML block list `tools:` then `  - A` lines (agy's loader requires it, 27b; the
// CoalMine shape, commit 04ae068). Both read to the same array, so the rights check is unchanged by the spelling.
// 27b bounce 1 (H1): the field is read from the frontmatter only, and a YAML comment or blank line inside the list is
// skipped (YAML keeps reading items after it). An indented line that is not `- item` makes the field unreadable: the seat
// gets no entry, so the gate reports it, never a partial read that hides a granted right.
const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const COMMENT_OR_BLANK = /^[ \t]*(?:#.*)?$/;
const YAML_ITEM = /^[ \t]+-[ \t]+(.*)$/;
// 27c bounce 1 (H1, L1): the key may be spelled with a space before the colon or with quotes, and every item must be a bare
// tool name (an allowlist, not a denylist). A comment, quotes or a trailing comment on an item grant the tool in YAML while the
// parser would record raw text no rights list matches, so any other item makes the whole field unreadable.
const TOOLS_KEY = /^["']?tools["']?[ \t]*:/;
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const namesOnly = (items) => (items.every((t) => TOOL_NAME.test(t)) ? items : null);

// One seat's `tools:` field, or null when it is absent, a flow list, empty, or holds a line that is not a `- item`.
// 27b bounce 2 (M1): a second column-0 `tools:` key is refused (YAML keeps the LAST, the gate would read the FIRST), and an
// inline value followed by an indented line is refused (YAML folds that line into the value, so it can grant a right).
function readTools(frontmatter) {
  const lines = frontmatter.replace(/\r/g, '').split('\n');
  const keys = lines.filter((l) => TOOLS_KEY.test(l)).length;
  if (keys !== 1) return null;
  const at = lines.findIndex((l) => TOOLS_KEY.test(l));
  const inline = lines[at].replace(TOOLS_KEY, '').trim();
  if (inline) {
    const next = lines.slice(at + 1).find((l) => !COMMENT_OR_BLANK.test(l));
    if (next !== undefined && /^[ \t]/.test(next)) return null;
    return inline.startsWith('[') ? null : namesOnly(inline.split(',').map((t) => t.trim()).filter(Boolean));
  }
  const items = [];
  for (const line of lines.slice(at + 1)) {
    if (COMMENT_OR_BLANK.test(line)) continue;
    if (/^\S/.test(line)) break;
    const m = YAML_ITEM.exec(line);
    if (!m) return null;
    items.push(m[1].trim());
  }
  return items.length ? namesOnly(items) : null;
}

export function parseAgentTools(agentDefs) {
  const out = {};
  for (const { rel, text } of agentDefs) {
    const seat = /cb-([a-z0-9]+)\.md$/.exec(rel);
    const fm = FRONTMATTER.exec(text);
    const tools = seat && fm ? readTools(fm[1]) : null;
    if (seat && tools) out[seat[1]] = tools;
  }
  return out;
}

export const shellHolders = (ledger) => Object.keys(ledger).filter((s) => ledger[s].run);

export function checkSeatRights({ skillText, agentDefs }) {
  const findings = [];
  const ledger = parseSeatLedger(skillText);
  const tools = parseAgentTools(agentDefs);
  const seats = Object.keys(ledger);
  if (seats.length !== 5) findings.push(`the Seat-permissions ledger must have exactly 5 rows, parsed ${seats.length} (${seats.join(', ')})`);
  for (const seat of seats) {
    const t = tools[seat];
    if (!t) { findings.push(`seat \`${seat}\` has a ledger row but no readable \`tools:\` field in agents/cb-${seat}.md (absent, a flow list, empty, or a line that is not a \`- item\`)`); continue; }
    const has = (list) => list.filter((x) => t.includes(x));
    for (const r of READ_TOOLS) if (!t.includes(r)) findings.push(`cb-${seat}: Read-class tool ${r} missing (every seat reads)`);
    if (has(SHELL_TOOLS).length > 0 && !ledger[seat].run) findings.push(`cb-${seat}: grants ${has(SHELL_TOOLS).join('/')} but the ledger row says no run (P19)`);
    if (has(SHELL_TOOLS).length === 0 && ledger[seat].run) findings.push(`cb-${seat}: the ledger row says run but no shell tool is granted`);
    const f = has(FETCH_TOOLS);
    if (f.length > 0 && !ledger[seat].fetch) findings.push(`cb-${seat}: grants ${f.join('/')} but the ledger row says no fetch (P19)`);
    if (ledger[seat].fetch && f.length !== FETCH_TOOLS.length) findings.push(`cb-${seat}: the ledger row says fetch but ${FETCH_TOOLS.filter((x) => !t.includes(x)).join('/')} is not granted`);
    const bad = has(NEVER_GRANTED);
    if (bad.length) findings.push(`cb-${seat}: grants ${bad.join('/')}, which NO seat is ever granted (write or spawn)`);
  }
  return findings;
}
