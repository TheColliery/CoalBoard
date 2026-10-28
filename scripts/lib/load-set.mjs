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
export function checkLoadSet(files) {
  const findings = [];
  for (const rel of LOAD_SET) if (!files.some((f) => f.rel === rel)) findings.push(`${rel} is in the load set but was not supplied`);
  const skill = files.find((f) => f.rel === SKILL_REL);
  if (!skill) return findings;
  const rows = skill.text.split('\n').filter((l) => l.startsWith('|'));
  for (const ref of LOAD_REFS) {
    const row = rows.find((l) => l.includes(ref));
    if (!row) findings.push(`SKILL.md References table has no row for ${ref}, a load-set file read before Step 0`);
    else if (!/MANDATORY/.test(row)) findings.push(`SKILL.md lists ${ref} but not as MANDATORY before Step 0`);
  }
  return findings;
}
