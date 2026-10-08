// R15 item 2 (CWK-160): the run-safety contract in skills/coalboard/references/run-safety.md.
//
// WHAT THIS BINDS: (1) the ledger exists with S1-S5 and N1-N2, each safeguard row naming a proof the return must
// state, and the ANCHOR PHRASES of the owner's amendments, one per sentence in the safeguard's own text (S1 mtime +
// SHA-256, S2 RESTORE + FINDING, S3 outside the home tree + never the session scratchpad, S5 NARROW + exactly the
// directory, N2 HOME stays real) and the S4 probe section's two WSL ways out ([interop], [automount] with fstab); (2) every actor that runs a command, DERIVED from SKILL.md (the Seat-permissions rows with run, plus main's
// `execute` grant class), is bound by S1, S2, S3, S4 and S5 (nobody who holds a shell escapes a safeguard); (3) S4,
// the box, is declared OPTIONAL in general with a probe and a fallback to S1-S3 (no-external-assumption: a user may
// have no isolation tool), PLUS the one class where it is MANDATORY (UMB2-008, owner 2026-10-07): a target whose
// effects are not files (registry, Appx or package removal, services, scheduled tasks, system settings) is never
// executed outside a real box and is otherwise read statically; (4) the owner's ruling "the clone may live anywhere,
// the whole clone is removed when the run ends": S3 offers RECOMMENDED roots (%ProgramData% on Windows, mktemp -d on
// POSIX), says a run MAY use another place, drops the "off the drive root" instruction and has the return name the
// path; S5 removes the WHOLE clone EVERY run, proves it (clone removed, the path, gone) and says a run that leaves
// its clone has NOT met its own done-criteria; (4b) round 2: the S2 backup holds copies of the user's real configs, so
// it lives INSIDE the run directory as a SIBLING of the clone (never an ancestor: a tool that walks up would read a
// copy as a real config), under SHA-256 names plus one manifest, and S5 removes it WITH the clone after S2's restore;
// S3 names the run directory and advises restricting it to the current user on Windows (icacls /inheritancelevel:r,
// the form Microsoft Learn documents) because %ProgramData% is readable by other local accounts by default;
// (4c) u2: S3 asserts the run directory's real path is outside the home tree BEFORE anything is copied in (a TMPDIR inside the
// home falls back to /tmp), S4 says a box the probe passes is used for the non-file class, and the lens line carries every one of
// these S3 clauses because a shell seat sees only that line;
// (5) the duty reaches the places a model reads at run time: every Bash-holding seat's FIXED rules in lens-prompts.md
// (naming the ledger, all five ids, the never-outside-a-box class and the removal proof), and Step 4.2's isolation
// line in SKILL.md; (6) the references table lists the file as MANDATORY. The no-new-right half (run safety adds a
// duty, never a tool) is seat-rights.mjs.
// WHAT IT CANNOT BIND: that a model follows S1-S5 (prose, below probability 1), that a clone WAS removed (that is a
// run-time act the return states; the gate reads the text that demands it), that the non-file class list is complete,
// that the icacls form still holds on a later Windows (the Learn page and the date read are in the text), or that a
// probe command is right on a given platform (version-sensitive; the reference says so).
// FOURTH TENSE: an edit that reverses a sentence and keeps its anchor words is not caught.
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
    if (!/\bMANDATORY\b/.test(s4.first)) findings.push('S4 (the box) label must say MANDATORY for non-file effects: a plain (OPTIONAL) label hides the one class that is never run outside a box');
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
    // UMB2-008 (owner 2026-10-07): the clone may live anywhere; the whole clone is removed when the run ends.
    ['S3', [/\bRECOMMENDED\b/, /%ProgramData%/, /mktemp -d/], 'S3 must name RECOMMENDED lab roots: %ProgramData% on Windows, mktemp -d on POSIX'],
    ['S3', [/\bMAY use another place\b/], 'S3 must say a run MAY use another place (the roots are advice, not a requirement)'],
    ['S4', [/\bOPTIONAL in general\b/], 'S4 must say it is OPTIONAL in general (a user may have no isolation tool)'],
    ['S4', [/effects are not files/, /registry/, /\bAppx\b/], 'S4 must name the non-file-effects class (registry writes, Appx removal, services, ...) whose effects S2 cannot restore'],
    ['S4', [/NEVER executed outside a real S4 box/], 'S4 must say the non-file-effects class is NEVER executed outside a real S4 box'],
    ['S4', [/read statically/], 'S4 must say that class is read statically when no box exists'],
    ['S5', [/\bWHOLE clone\b/], 'S5 must remove the WHOLE clone'],
    ['S5', [/\bEVERY run\b/], 'S5 must apply to EVERY run, success or failure'],
    ['S5', [/under the root it was created in/], 'S5 must assert the real path under the root the clone was created in, before the delete'],
    ['S5', [/never forced/], 'S5 must say a refused delete is reported, never forced, and counts as the clone not removed'],
    ['S5', [/NOT met its own done-criteria/], 'S5 must say a run that leaves its clone has NOT met its own done-criteria'],
    // UMB2-008 round 2 (INSPECT MEDIUM-1, MEDIUM-2): where the S2 backup lives and goes, and who may read the run root.
    ['S2', [/inside the run directory/], 'S2 must put the backup inside the run directory (so S5 removes it with the clone)'],
    ['S2', [/SIBLING of the clone/], 'S2 must put the backup beside the clone as a SIBLING'],
    ['S2', [/never an ancestor of the clone/], 'S2 must say the backup is never an ancestor of the clone (a tool that walks up would read a copy as a real config)'],
    ['S2', [/manifest\.txt/], 'S2 must name backup files by SHA-256 and keep the original paths in one manifest.txt'],
    ['S3', [/RUN DIRECTORY/], 'S3 must name the RUN DIRECTORY that holds clone/ and backup/'],
    ['S3', [/restrict the run directory to the current user/], 'S3 must advise restricting the run directory to the current user on Windows, before anything is copied in'],
    ['S3', [/icacls/, /\/inheritancelevel:r/], 'S3 must give the icacls form that Microsoft Learn documents (/inheritancelevel:r)'],
    // u2 (t24 #7, #6, the S8 walk note): the real-path assert before the copy, its /tmp fallback, the no-outside-place fallback, the box used when found.
    ['S3', [/\breal path\b/, /outside the home tree BEFORE anything is copied in/], "S3 must assert the run directory's real path is outside the home tree BEFORE anything is copied in"],
    ['S3', [/then use `\/tmp`/], 'S3 must say a TMPDIR inside the home tree falls back to /tmp (or states why it could not)'],
    ['S3', [/let S2 carry the weight/], 'S3 must say, with no outside place, to say so and let S2 carry the weight'],
    ['S4', [/with a box the probe passes, run it inside that box/], 'S4 must say that with a box the probe passes the non-file class runs inside that box'],
    ['S5', [/together with its backup/], 'S5 must remove the backup together with the clone'],
    ['S5', [/AFTER S2's restore/], 'S5 must run AFTER S2\'s restore (the restore needs the backup)'],
  ];
  // the return must state these (the proof column is what the return carries)
  const PROOF = [
    ['S3', /NAMES the path the run used/, 'S3 proof must have the return name the path the run used'],
    ['S5', /clone removed/, 'S5 proof must be `clone removed`'],
    ['S5', /\bgone\b/, 'S5 proof must state the path is gone (a re-check that it no longer exists)'],
    ['S5', /the clone and the backup are gone/, 'S5 proof must state the backup is gone too'],
    ['S5', /run directory/, 'S5 proof must name the run directory path'],
  ];
  for (const [id, re, msg] of PROOF) if (rows[id] && !re.test(rows[id].proof)) findings.push(msg);
  if (rows.S3 && /off the drive root/.test(rows.S3.safeguard)) findings.push('S3 must not tell Windows to use a directory off the drive root: no standard names such a folder, and the owner ruled the clone may live anywhere');
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
  else {
    needs(lensLine, 'the lens-prompts.md FIXED rule', false); // the seat sees only this line, so each id is restated, never a range
    for (const [re, msg] of [
      [/NEVER run outside a real box/, 'the lens-prompts.md FIXED rule must say the non-file-effects class is NEVER run outside a real box'],
      [/read statically/, 'the lens-prompts.md FIXED rule must say that class is read statically when no box exists'],
      [/`clone removed`/, 'the lens-prompts.md FIXED rule must carry the clone-removal proof (`clone removed`)'],
      [/\bgone\b/, 'the lens-prompts.md FIXED rule must say the removal proof includes that the path is gone'],
      [/never above the clone/, 'the lens-prompts.md FIXED rule must put the S2 backup beside the clone, never above it'],
      [/clone and S2 backup together/, 'the lens-prompts.md FIXED rule must remove the S2 backup with the clone'],
      [/ONE run directory holding/, 'the lens-prompts.md FIXED rule must name the ONE run directory that holds clone/ and backup/'],
      [/real path is outside the home tree BEFORE anything is copied in/, "the lens-prompts.md FIXED rule must assert the run directory's real path is outside the home tree BEFORE anything is copied in"],
      [/icacls <run-dir> \/inheritancelevel:r/,'the lens-prompts.md FIXED rule must carry the Windows restrict-to-your-user step (icacls /inheritancelevel:r)'],
      [/let S2 carry the weight/, 'the lens-prompts.md FIXED rule must say, with no outside place, to say so and let S2 carry the weight'],
      [/cannot do S1, S2 or S5/, 'the lens-prompts.md FIXED rule must say a seat that cannot do S1, S2 or S5 does not run (NOT-CHECKED)'],
      [/with a box the probe passes, run it inside that box/, 'the lens-prompts.md FIXED rule must say that with a box the probe passes the non-file class runs inside that box'],
    ]) if (!re.test(lensLine)) findings.push(msg);
  }
  const step42 = skill.text.split('\n').find((l) => /Verify — YOU run it/.test(l));
  if (!step42) findings.push('SKILL.md Step 4.2 (the verify line) was not found');
  else needs(step42, 'SKILL.md Step 4.2', true); // main reads the reference, so `S1-S5` names the range
  const refRow = skill.text.split('\n').find((l) => l.startsWith('|') && /references\/run-safety\.md/.test(l));
  if (!refRow) findings.push('SKILL.md References table has no row for references/run-safety.md');
  else if (!/MANDATORY/.test(refRow)) findings.push('SKILL.md lists references/run-safety.md but not as MANDATORY at its moment');
  return findings;
}
