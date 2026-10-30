// 28b: the skill's LOAD SET. An agent reads SKILL.md, then `references/steps.md` and `references/rails.md` in full before Step 0, on every lane and
// in every mode (SKILL.md's `## The steps` says so). The steps and the standing rails live in those two references, so a prose gate that verified a
// rail in SKILL.md now reads the load set instead.
//
// The two reference names are held here as one named constant. checkLoadSet() proves that every name is a MANDATORY row of SKILL.md's References
// ledger, so the constant and the ledger cannot drift apart. ONE SOURCE per rail: a gate that demands EXACTLY ONE of a rail counts across the whole
// load set, never "at least one in any file".
export const SKILL_REL = 'skills/coalboard/SKILL.md';
export const LOAD_REFS = ['references/steps.md', 'references/rails.md'];
export const LOAD_SET = [SKILL_REL, ...LOAD_REFS.map((r) => `skills/coalboard/${r}`)];

// The load-set files that were supplied, in LOAD_SET order (SKILL.md first).
export function loadSetFiles(files) {
  return LOAD_SET.map((rel) => files.find((f) => f.rel === rel)).filter(Boolean);
}

// The load set's own findings: each named file supplied, and each reference a MANDATORY row of SKILL.md's References ledger.
// The Antigravity load facts, held by the gate (INSPECT 28b F1). Antigravity loads a skill body only to ANTIGRAVITY_BODY_CAP bytes: agy 1.4.8,
// measured 2026-10-27 (PROBE-RECORD.md, the 2.8.11 truncation at 24,000 bytes). Anything past the cap is cut from the tail, and `## The steps` sits
// in the body where a regrowth would cut it first. The bound is a measured platform fact, never a number of ours, so a change of agy version
// re-measures it rather than editing it here.
export const ANTIGRAVITY_BODY_CAP = 24000;
const STEPS_HEADING = '## The steps';
// The line must say every lane as well as before Step 0 (29b-c1, T-28b-1): the ledger rows already carry "MANDATORY before Step 0, every lane".
const STEPS_MANDATORY = (line) => /MANDATORY/.test(line) && /before Step 0/.test(line) && /every lane/.test(line) && LOAD_REFS.every((r) => line.includes(r));

// SKILL.md's body: the file minus its frontmatter block, the same bytes agy reads.
function bodyOf(text) {
  const end = text.indexOf('\n---', 4);
  return end === -1 ? text : text.slice(end + 4);
}

// The skill file's own findings: the body within the cap, `## The steps` inside the first cap bytes, and its MANDATORY line naming both references.
export function checkAntigravityLoad(skill) {
  const findings = [];
  const body = bodyOf(skill.text);
  const size = Buffer.byteLength(body, 'utf8');
  if (size > ANTIGRAVITY_BODY_CAP) findings.push(`${skill.rel} body is ${size} bytes, over the ${ANTIGRAVITY_BODY_CAP}-byte Antigravity load (agy 1.4.8, measured 2026-10-27): the tail is cut`);
  const at = body.indexOf(`\n${STEPS_HEADING}`);
  if (at === -1) findings.push(`${skill.rel} has no ${STEPS_HEADING} heading`);
  else {
    const offset = Buffer.byteLength(body.slice(0, at + 1), 'utf8');
    if (offset >= ANTIGRAVITY_BODY_CAP) findings.push(`${STEPS_HEADING} begins at body byte ${offset}, past the ${ANTIGRAVITY_BODY_CAP}-byte load: Antigravity never reads it`);
    const section = body.slice(at + 1).split('\n## ')[0];
    if (!section.split('\n').some(STEPS_MANDATORY)) findings.push(`${STEPS_HEADING} does not name references/rails.md and references/steps.md as MANDATORY before Step 0, every lane`);
  }
  return findings;
}

// Each step and standing rail is ONE heading across the load set (INSPECT 28b F2): the gate holds the same one-source rule the clamp clause holds.
const ONCE_HEADINGS = [
  ...[0, 1, 2, 3, 4].map((n) => [`## Step ${n}`, new RegExp(`^## Step ${n}(?=\\s|$)`)]),
  ['## Memory & resume', /^## Memory & resume(?=\s|$)/],
  ['## Modes', /^## Modes(?=\s|$)/],
  ['## Grants & denials', /^## Grants & denials(?=\s|$)/],
  ['## Always', /^## Always(?=\s|$)/],
];

export function checkLoadSet(files) {
  const findings = [];
  for (const rel of LOAD_SET) if (!files.some((f) => f.rel === rel)) findings.push(`${rel} is in the load set but was not supplied`);
  const skill = files.find((f) => f.rel === SKILL_REL);
  if (!skill) return findings;
  const rows = skill.text.split('\n').filter((l) => l.startsWith('|'));
  for (const ref of LOAD_REFS) {
    const row = rows.find((l) => l.includes(ref));
    if (!row) findings.push(`SKILL.md References table has no row for ${ref}, a load-set file read before Step 0`);
    else if (!row.includes('MANDATORY before Step 0, every lane')) findings.push(`SKILL.md lists ${ref} but not as MANDATORY before Step 0, every lane`);
  }
  const lines = loadSetFiles(files).flatMap((f) => f.text.split('\n'));
  for (const [name, re] of ONCE_HEADINGS) {
    const count = lines.filter((l) => re.test(l)).length;
    if (count !== 1) findings.push(`${name} appears ${count} times across the load set (SKILL.md, references/steps.md, references/rails.md); each step and standing rail is exactly one heading`);
  }
  return findings;
}
