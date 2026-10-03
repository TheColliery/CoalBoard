// R15 item 2 (CWK-160): the run-safety contract in skills/coalboard/references/run-safety.md.
//
// WHAT THIS BINDS: (1) the ledger exists with S1-S5 and N1-N2, each safeguard row naming a proof the return must
// state, and the CONTENT of the owner's amendments, one anchor per sentence in the safeguard's own text (S1 mtime +
// SHA-256, S2 RESTORE + FINDING, S3 outside the home tree + never the session scratchpad, S5 NARROW + exactly the
// directory, N2 HOME stays real) and the S4 probe section's two WSL ways out ([interop], [automount] with fstab); (2) every actor that runs a command, DERIVED from SKILL.md (the Seat-permissions rows with run, plus main's
// `execute` grant class), is bound by S1, S2, S3, S4 and S5 (nobody who holds a shell escapes a safeguard); (3) S4,
// the box, is declared OPTIONAL with a probe and a fallback to S1-S3 (no-external-assumption: a user may have no
// isolation tool); (4) the duty reaches the places a model reads at run time: every Bash-holding seat's FIXED rules
// in lens-prompts.md, and Step 4.2's isolation line in SKILL.md, each naming the ledger and all five ids; (5) the
// references table lists the file as MANDATORY. The no-new-right half (run safety adds a duty, never a tool) is
// seat-rights.mjs.
// WHAT IT CANNOT BIND: that a model follows S1-S5 (prose, below probability 1), or that a probe command is right on a
// given platform (version-sensitive; the reference says so).
import { parseSeatLedger, shellHolders } from './seat-rights.mjs';

const IDS = ['S1', 'S2', 'S3', 'S4', 'S5'];
const NEVERS = ['N1', 'N2'];

export function parseSafeguardLedger(text) {
  const rows = {};
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const id = /\*\*(S\d|N\d)\b/.exec(cells[0] || '');
    if (!id) continue;
    rows[id[1]] = { first: cells[0], safeguard: cells[1] || '', binds: cells[2] || '', proof: cells[3] || '' , raw: line };
  }
  return rows;
}

export function checkRunSafety({ files }) {
  const findings = [];
  const get = (rel) => files.find((f) => f.rel === rel);
  const ref = get('skills/coalboard/references/run-safety.md');
  const skill = get('skills/coalboard/SKILL.md');
  const lens = get('skills/coalboard/references/lens-prompts.md');
  if (!skill) return ['skills/coalboard/SKILL.md not supplied to the run-safety gate'];
  if (!ref) return ['skills/coalboard/references/run-safety.md is missing: a run has no survey, backup, compare or cleanup rule'];

  const rows = parseSafeguardLedger(ref.text);
  for (const id of [...IDS, ...NEVERS]) if (!rows[id]) findings.push(`run-safety.md has no ${id} row`);
  const ledger = parseSeatLedger(skill.text);
  const actors = [...new Set([...shellHolders(ledger), ...(/^\|\s*execute\s*\|/m.test(skill.text) ? ['main'] : [])])];
  if (!actors.includes('main')) findings.push('SKILL.md has no `execute` grant class for main: the main-runs half of the duty has nothing to bind');
  if (actors.length < 3) findings.push(`expected at least 3 run-capable actors (main + 2 shell seats), derived ${actors.length}: ${actors.join(', ')}`);

  for (const id of IDS) {
    const row = rows[id];
    if (!row) continue;
    if (!row.proof) findings.push(`${id} names no proof for the return to state`);
    const bound = new Set(row.binds.split(/[·,]/).map((t) => t.trim().toLowerCase()).filter(Boolean));
    for (const actor of actors) if (!bound.has(actor)) findings.push(`${id} does not bind \`${actor}\`, who can run commands (the ledger derives its run-capable actors from SKILL.md)`);
  }
  const s4 = rows.S4;
  if (s4) {
    if (!/\bOPTIONAL\b/.test(s4.first)) findings.push('S4 (the box) must be marked OPTIONAL: a user may have no isolation tool');
    if (/\bREQUIRED\b/.test(s4.raw)) findings.push('S4 (the box) must never be REQUIRED');
    if (!/\bprobe\b/i.test(s4.safeguard)) findings.push('S4 names no capability probe');
    if (!/S1-S3/.test(s4.safeguard)) findings.push('S4 names no fallback to S1-S3 when no box is found');
  }
  // CONTENT anchors: the two owner amendments ARE these sentences, so the gate binds them in the safeguard's own text
  // (not its heading cell, which names the verbs). A later edit that reverses one fails here, not only in dist-in-sync.
  const CONTENT = [
    ['S1', [/mtime/, /SHA-256/], 'S1 must say to record each real file\'s mtime and SHA-256 before the run'],
    ['S2', [/\bRESTORE\b/, /\bFINDING\b/], 'S2 must say a changed real file is RESTORED and reported as a FINDING'],
    ['S3', [/outside the home tree/i, /Never in the session scratchpad/], 'S3 must keep the clone outside the home tree and "Never in the session scratchpad"'],
    ['S5', [/\bNARROW\b/, /exactly the directory/], 'S5 must keep the NARROW delete of exactly the directory the run created'],
  ];
  for (const [id, res, msg] of CONTENT) if (rows[id] && !res.every((re) => re.test(rows[id].safeguard))) findings.push(msg);
  if (rows.N2 && !(/\bHOME\b/.test(rows.N2.raw) && /stays real/.test(rows.N2.raw))) findings.push('N2 must keep "HOME stays real" unless a real box is in use');
  const probe = /## Probing for a box[\s\S]*?(?=\n## |$)/.exec(ref.text);
  if (!probe) findings.push('run-safety.md has no "Probing for a box" section');
  else {
    if (!/\[interop\]/.test(probe[0])) findings.push('the S4 probe section must ask whether a Windows process can be launched from inside a WSL box ([interop])');
    if (!/\[automount\]/.test(probe[0]) || !/fstab/.test(probe[0])) findings.push('the S4 probe section must ask whether the drives reach the real profile, manual and fstab mounts included ([automount])');
  }
  const n1 = rows.N1;
  if (n1 && !/environment variable/i.test(n1.raw)) findings.push('N1 must name the environment-variable form of fake isolation');

  const needs = (text, where, allowRange) => {
    if (!/references\/run-safety\.md/.test(text)) findings.push(`${where} does not point at references/run-safety.md`);
    const body = allowRange ? text : text.replace(/\bS[1-9]\s*[-–]\s*S[1-9]\b/g, ''); // a range is not an explicit id
    const named = new Set([...body.matchAll(/\bS([1-9])\b/g)].map((m) => `S${m[1]}`));
    if (allowRange) for (const m of text.matchAll(/\bS([1-9])\s*[-–]\s*S([1-9])\b/g)) for (let k = Number(m[1]); k <= Number(m[2]); k++) named.add(`S${k}`); // `S1-S5` names the range
    for (const id of IDS) if (!named.has(id)) findings.push(`${where} does not name ${id}`);
  };
  const lensLine = lens && lens.text.split('\n').find((l) => /run-safety\.md/.test(l) && /^-\s/.test(l));
  if (!lensLine) findings.push('lens-prompts.md has no FIXED rule that points at references/run-safety.md for the Bash-holding seats');
  else needs(lensLine, 'the lens-prompts.md FIXED rule', false); // the seat sees only this line, so each id is restated, never a range
  const step42 = skill.text.split('\n').find((l) => /Verify — YOU run it/.test(l));
  if (!step42) findings.push('SKILL.md Step 4.2 (the verify line) was not found');
  else needs(step42, 'SKILL.md Step 4.2', true); // main reads the reference, so `S1-S5` names the range
  const refRow = skill.text.split('\n').find((l) => l.startsWith('|') && /references\/run-safety\.md/.test(l));
  if (!refRow) findings.push('SKILL.md References table has no row for references/run-safety.md');
  else if (!/MANDATORY/.test(refRow)) findings.push('SKILL.md lists references/run-safety.md but not as MANDATORY at its moment');
  return findings;
}
