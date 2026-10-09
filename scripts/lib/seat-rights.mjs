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

// agents/cb-<seat>.md frontmatter `tools: A, B, C` -> { data: ['Read', ...] }
export function parseAgentTools(agentDefs) {
  const out = {};
  for (const { rel, text } of agentDefs) {
    const seat = /cb-([a-z0-9]+)\.md$/.exec(rel);
    const tools = /^tools:\s*(.+)$/m.exec(text);
    if (seat && tools) out[seat[1]] = tools[1].split(',').map((t) => t.trim()).filter(Boolean);
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
    if (!t) { findings.push(`seat \`${seat}\` has a ledger row but no agents/cb-${seat}.md \`tools:\` line`); continue; }
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
