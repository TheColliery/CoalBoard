// 29b-c1 (CR-2): the reference inventory. Every shipped reference under skills/coalboard/references/ keeps the level-2 headings listed below, in source
// AND in dist. CR-2 was platform-antigravity.md cut from 23 lines to 4 (f7b1f6d): its three headed sections and the only reap instruction went with it,
// while every gate stayed green. The list is a snapshot of the tree after the 2.9.1 restore (66366b8). A heading added to a file is fine; a deliberate
// removal edits this list in the same commit, so the diff shows it. The gate reads the tree; nothing here is a count pinned in prose.
export const REFERENCE_HEADINGS = {
  "audit.md": [
    "## What a code-only pass misses",
    "## Enumerate the scope — every file, scope-contained (#12 · #13)",
    "## Interlinked subprojects = ONE connected whole (#15)",
    "## No stale prior-audit READ (#11)",
    "## Audit-independence + where the report lives",
    "## Self-audit honesty (the cross-platform claim)",
  ],
  "failure-modes.md": [
    "## Why \"bounded cost\" is the claim — the thrash mechanic (moved from the body; Run 12 measured 6/6 upper-tier walkers reading it there as a rail)",
    "## Docs ≠ reality: the nesting lesson (moved from the body's capability-hack gate; the gate's rail stays there, this is the why)",
    "## Why LEAF is enforced STRUCTURALLY, not by prose (issue #2)",
    "## The flatten limit — why main cannot reap a deep lens (HONEST CC LIMIT, proven live)",
    "## Why the Step-1 blind/read-once rails are structural (carved from SKILL.md — rails unchanged there)",
    "## Why sub4's ruling stands without an extra gate (carved from steps.md Step 3)",
    "## Sub resume — the SendMessage-absent mechanics (why remainder-re-spawn is PRIMARY)",
  ],
  "lens-prompts.md": [
    "## Placeholders (main fills, mechanically)",
    "## FIXED rules — every lens prompt carries these verbatim",
    "## Per-lens role line (use the active lens's)",
    "## `{work-type-checklist}` (substitute the chosen work-type's)",
    "## Seat permissions (the `{seat-rights}` fill — WHY each minimum is sufficient)",
    "## Model assignment (DETERMINISTIC BY TABLE — an ORCHESTRATION param, NOT a prompt placeholder)",
  ],
  "opinion-board.md": [
    "## Frame the question (before any spawn)",
    "## The 4 seats — equal knowledge, locked perspective (the ONLY difference)",
    "## The rest of SKILL.md's P-ledger, classified (the complete set — this lane never guesses)",
    "## PROPOSAL present → REFUTE, never grade",
    "## Judge (you, main) — synthesize, never count",
    "## NAMED divergences from the error-not-allowed lane (deliberate — do not \"fix\")",
  ],
  "platform-antigravity.md": [
    "## Tool mapping (Claude Code → Antigravity)",
    "## Verified caveats",
    "## Degrade",
  ],
  "platform-cc.md": [
    "## Fable is exposed as SAFE-OR-BLOCK (a pre-generation gate, 0 tokens)",
    "## A fable block needs NO new CB recovery code — it rides the existing re-route",
    "## The consent-box cost note (what the fable ask SHOWS)",
  ],
  "rails.md": [
    "## Grants & denials (CLASSIFY-BLOCK — declared)",
    "## Always",
  ],
  "run-safety.md": [
    "## The safeguard ledger — S1-S5 (TRANSCRIBE; the proof column is what the return states)",
    "## The two nevers",
    "## Probing for a box (S4) — the property, not the platform",
    "## How this binds the seats",
  ],
  "source-set.md": [
    "## The source ledger — A1-A3, C1, L1-L5, E1 (TRANSCRIBE; the unreachable column is what the report states)",
    "## How each class is used",
  ],
  "steps.md": [
    "## Step 0 — Convene? (gate + consent)",
    "## Step 1 — Convene the lenses (PARALLEL · blind · single-turn)",
    "## Step 2 — Judge (you, the barrier)",
    "## Step 3 — The out-of-frame check (conditional)",
    "## Step 4 — Stage → verify → consent → apply (zero-breakage)",
    "## Memory & resume (durable · per-agent · private · EPHEMERAL)",
    "## Modes",
  ],
  "wizard.md": [
    "## LAYMAN-DEFAULT — the AI handles everything (the default path)",
    "## PROGRAMMER — full control (opt-in: \"advanced\" / stating prefs / config), the restaurant flow",
    "## Convene",
  ],
};

// The reap rail's content anchor: platform-antigravity.md carries these terms on ONE line (the reap instruction that CR-2 found missing).
export const REAP_RAIL = { file: 'platform-antigravity.md', terms: ['manage_subagents', 'kill_all'] };

// L2 (29e): the table rows a rail stands on, pinned by their label and their load-bearing content, not by a heading or one anchor line. A row that
// is missing, or that has lost one of its terms, is a finding naming the file and the row label. The labels are the first cell of each row.
export const REFERENCE_ROWS = [
  { file: 'platform-antigravity.md', label: '| reap (no-zombie) |', terms: ['manage_subagents', 'kill_all', '(MANDATORY)'] },
  { file: 'platform-antigravity.md', label: '| spawn a lens |', terms: ['enable_write_tools=false', 'enable_subagent_tools=false'] },
  { file: 'platform-antigravity.md', label: '| read-only + leaf |', terms: ['TOOL-LEVEL', 'ABSENT from the sub'] },
];
// 29e T-29e-1: every pinned term is read from the row's ANTIGRAVITY cell (the third and last cell), never the whole line. The Claude Code cell of the
// read-only row also says TOOL-LEVEL, so a whole-line pin held a weakened Antigravity cell. All three rows put their terms in the Antigravity cell.
const REFERENCE_ROW_CELLS = 3;

// The inventory's own findings. files: [{ rel, text }] under prefix (skills/coalboard/ for source, plugin/skills/coalboard/ for dist).
export function checkReferenceInventory(files, prefix) {
  const findings = [];
  for (const [file, headings] of Object.entries(REFERENCE_HEADINGS)) {
    const rel = `${prefix}references/${file}`;
    const found = files.find((f) => f.rel === rel);
    if (!found) { findings.push(`${rel} is named by the reference inventory but is missing from the tree`); continue; }
    const lines = found.text.split('\n');
    for (const h of headings) if (!lines.includes(h)) findings.push(`${rel} lost the heading ${h} that the reference inventory lists`);
  }
  const reap = files.find((f) => f.rel === `${prefix}references/${REAP_RAIL.file}`);
  if (reap && !reap.text.split('\n').some((l) => REAP_RAIL.terms.every((t) => l.includes(t)))) {
    findings.push(`${prefix}references/${REAP_RAIL.file} has no line holding ${REAP_RAIL.terms.join(' and ')} (the reap rail, CR-2)`);
  }
  for (const row of REFERENCE_ROWS) {
    const rel = `${prefix}references/${row.file}`;
    const found = files.find((f) => f.rel === rel);
    if (!found) continue; // a missing file is already one finding in the heading loop above
    const line = found.text.split('\n').find((l) => l.startsWith(row.label));
    if (!line) { findings.push(`${rel} has no table row ${row.label} (a rail row the inventory pins)`); continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== REFERENCE_ROW_CELLS) { findings.push(`${rel} row ${row.label} has ${cells.length} cells, not the ${REFERENCE_ROW_CELLS} of step | Claude Code | Antigravity`); continue; }
    const antigravity = cells[REFERENCE_ROW_CELLS - 1];
    for (const term of row.terms) if (!antigravity.includes(term)) findings.push(`${rel} row ${row.label} lost ${term} in its Antigravity cell`);
  }
  return findings;
}
