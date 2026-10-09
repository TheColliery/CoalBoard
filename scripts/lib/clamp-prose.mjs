// R15 item 3 (the CB-R1 PROSE half, main's ruling UMB-365 (7); hooks-safety.md section 9: a hook clamp reaches the
// HOOK's read only, and the instruction the AGENT follows is a read site exactly as much as the hook's readCfg()).
//
// WHAT THIS BINDS (and what it does not):
//  1. THE CANONICAL CLAUSE exists in SKILL.md ("Always"): one line that says an unknown value counts as ABSENT and
//     names every key the HOOK clamps (derived from the conductor's SAFER_ENUM, never listed here) with EXACTLY the
//     enum values the schema declares for it (prose cannot drift from config-schema.mjs), says a project's out-of-set
//     value falls back to the global value and a global's to the conductor's schema default (derived from SAFER_ENUM), and also names the
//     consent keys the agent reads unclamped (fableConsent, applyConsent) so their unknown-value rule is stated.
//  2. EVERY OTHER SITE in skills/**/*.md that names one of those keys as something the agent READS must say the
//     value is the MERGED one (a line that merely names the key reads as the raw project file, which is the
//     defect). A persist/write site (it names `persist`) and a preset-table row (a line that starts with `|`)
//     are not read sites.
// WHAT IT DOES NOT BIND: that a model obeys the clause. It is prose, enforced below probability 1 (hooks-safety
// section 9, "a clamp written in prose is a mitigation, not a fix"); the gate only stops a read site from being
// written without the qualifier, and the clause from drifting off the schema and the hook.
const AGENT_READ_CONSENT_KEYS = ['fableConsent', 'applyConsent'];

// Keys the hook clamps: the object keys of `const SAFER_ENUM = { ... }` in the conductor source.
export function hookClampedKeys(conductorText) {
  const block = /const SAFER_ENUM = \{([\s\S]*?)\n\};/.exec(conductorText);
  if (!block) return [];
  return [...block[1].matchAll(/^\s*([A-Za-z]\w*)\s*:\s*\{/gm)].map((m) => m[1]);
}

// The schema default the hook substitutes for an absent or unknown GLOBAL value: `default: 'x'` inside each SAFER_ENUM entry.
export function hookClampedDefaults(conductorText) {
  const block = /const SAFER_ENUM = \{([\s\S]*?)\n\};/.exec(conductorText);
  if (!block) return {};
  return Object.fromEntries([...block[1].matchAll(/^\s*([A-Za-z]\w*)\s*:\s*\{[^}]*default:\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
}

// The ORDER the hook clamps by, per key: `order: ['off', 'remind', ...]` inside each SAFER_ENUM entry (PR 19 #17). NAMED LIMIT (t29 #2): the pattern stops at the first
// closing brace, so an entry whose `order:` follows a nested `{...}` derives no order; checkClampProse then reports that key as a finding instead of skipping it.
export function hookClampedOrders(conductorText) {
  const block = /const SAFER_ENUM = \{([\s\S]*?)\n\};/.exec(conductorText);
  if (!block) return {};
  return Object.fromEntries([...block[1].matchAll(/^\s*([A-Za-z]\w*)\s*:\s*\{[^}]*order:\s*\[([^\]]*)\]/gm)].map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]));
}

const isCanonical = (line) => /\bABSENT\b/.test(line) && /safer-value-wins/i.test(line);
const wordRe = (key) => new RegExp(`(^|[^A-Za-z0-9_])${key}([^A-Za-z0-9_]|$)`);

export function checkClampProse({ files, schemaEnums, clampedKeys, clampedDefaults = {}, clampedOrders = {} }) {
  const findings = [];
  const keys = [...clampedKeys, ...AGENT_READ_CONSENT_KEYS];
  if (clampedKeys.length === 0) findings.push('no hook-clamped keys were derived (conductor SAFER_ENUM not found): the prose cannot be checked against the hook');

  const skill = files.find((f) => f.rel === 'skills/coalboard/SKILL.md');
  const canonicalLines = skill ? skill.text.split('\n').filter(isCanonical) : [];
  if (canonicalLines.length !== 1) {
    findings.push(`skills/coalboard/SKILL.md must carry exactly ONE canonical clamp-aware clause (a line holding both ABSENT and safer-value-wins); found ${canonicalLines.length}`);
  } else {
    const clause = canonicalLines[0];
    // The absent/default RULE itself (LOW-2): keys and enum values were bound, but "a global's to `auto`" read as green.
    if (!/a project's falls back to the global value/.test(clause)) findings.push("the canonical clause must say a project's out-of-set value falls back to the global value");
    const defaults = [...new Set(Object.values(clampedDefaults))];
    if (defaults.length === 0) findings.push('no schema defaults were derived from the conductor SAFER_ENUM: the global fallback cannot be checked');
    else if (defaults.length === 1 && !clause.includes(`a global's to the default \`${defaults[0]}\``)) findings.push(`the canonical clause must say a global's out-of-set value reads as the schema default \`${defaults[0]}\` (the conductor's SAFER_ENUM default)`);
    else if (defaults.length > 1 && !/a global's to the default/.test(clause)) findings.push("the canonical clause must say a global's out-of-set value reads as the schema default");
    for (const key of keys) {
      if (!wordRe(key).test(clause)) findings.push(`the canonical clause does not name \`${key}\``);
    }
    for (const key of clampedKeys) {
      const values = schemaEnums[key];
      if (!Array.isArray(values)) { findings.push(`schema has no enum values for the hook-clamped key \`${key}\``); continue; }
      const m = new RegExp('`' + key + '`:\\s*((?:`[a-z]+`/?)+)').exec(clause);
      if (!m) { findings.push(`the canonical clause does not list the allowed values of \`${key}\` (as: \`${key}\`: \`a\`/\`b\`)`); continue; }
      const listed = new Set([...m[1].matchAll(/`([a-z]+)`/g)].map((x) => x[1]));
      const missing = values.filter((v) => !listed.has(v));
      const extra = [...listed].filter((v) => !values.includes(v));
      if (missing.length) findings.push(`the canonical clause lists \`${key}\` without the schema value(s) ${missing.map((v) => `\`${v}\``).join(', ')}`);
      if (extra.length) findings.push(`the canonical clause lists \`${key}\` with value(s) the schema does not declare: ${extra.map((v) => `\`${v}\``).join(', ')}`);
    }
    // PR 19 #17: the ORDER, key by key (`key` ranks `a`<`b`<`c`), must equal the conductor's SAFER_ENUM order, because the order is what the clamp
    // compares: a project value above the global one in this order is clamped down to it.
    // t29 #2: a clamped key with no derived order is a finding, never a skip (a reversed statement for it would pass unseen). The all-missing case keeps its one finding.
    const noOrders = clampedKeys.length > 0 && Object.keys(clampedOrders).length === 0;
    if (noOrders) findings.push('no clamp order was derived from the conductor SAFER_ENUM: the stated order cannot be checked');
    for (const key of clampedKeys) {
      const want = clampedOrders[key];
      if (!Array.isArray(want)) {
        if (!noOrders) findings.push(`no clamp order was derived for \`${key}\` from the conductor SAFER_ENUM: its stated order cannot be checked`);
        continue;
      }
      const m = new RegExp('`' + key + '`\\s+ranks\\s+((?:`[a-z]+`(?:<|(?![`a-z])))+)').exec(clause);
      if (!m) { findings.push(`the canonical clause does not state the clamp order of \`${key}\` (as: \`${key}\` ranks ${want.map((v) => `\`${v}\``).join('<')})`); continue; }
      const stated = [...m[1].matchAll(/`([a-z]+)`/g)].map((x) => x[1]);
      if (stated.join('<') !== want.join('<')) findings.push(`the canonical clause states the clamp order of \`${key}\` as ${stated.join('<')}, but the conductor's SAFER_ENUM order is ${want.join('<')}`);
    }
  }

  for (const { rel, text } of files) {
    text.split('\n').forEach((line, i) => {
      if (isCanonical(line) || line.trimStart().startsWith('|')) return;
      for (const key of keys) {
        // A persist/write MENTION is not a read: `persist` sits just before the key (a window, not the whole line,
        // so a read later on the same line is still held to the rule). EVERY mention is judged, not the first.
        const reads = [...line.matchAll(new RegExp(`(^|[^A-Za-z0-9_])${key}(?=[^A-Za-z0-9_]|$)`, 'g'))]
          .filter((m) => { const at = m.index + m[1].length; return !/\bpersist/i.test(line.slice(Math.max(0, at - 60), at)); });
        if (reads.length === 0) continue;
        if (!/\bmerged\b/i.test(line)) findings.push(`${rel}:${i + 1} reads \`${key}\` without saying it is the MERGED, clamp-aware value (SKILL.md "Always")`);
      }
    });
  }
  return findings;
}
