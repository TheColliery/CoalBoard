// R15 item 1 (CWK-159): the source-set contract in skills/coalboard/references/source-set.md.
//
// WHAT THIS BINDS: (1) the ledger covers the four additions by CLASS (alerts, catalogue, live-db, posix-seat), every
// row naming a source, who reads it, the right used, what it never carries and what the report says when it is
// unreachable; (2) EVERY ROW IS EXECUTED BY AN ACTOR THAT ALREADY HOLDS THE RIGHT: `fetch` only by a seat with the fetch
// cell (data), `run` only by a seat with the run cell (feeling, adversary), `execute` only by main, per SKILL.md's
// Seat-permissions ledger, so the widened source set adds no tool right (seat-rights.mjs separately proves the agent
// defs equal that ledger); (3) the alert rows are main's alone, so no credential reaches the one seat that can fetch;
// no alert row's carries cell names a value; A3's own text names `hide_secret=true` and the source-set text keeps the
// anchor phrases of the never-sent and discard-unread rule (the vendor endpoint returns the literal secret by default, so "never a secret
// value" holds only through that request form); (4) the unreachable column always says NOT-CHECKED or NOT-WALKED
// (a missing source is a named gap, never a clean bill); (5) the posix seat names run-safety S4, keeps "ONLY inside a
// box" and its S1-S3 limit; (6) the places a model reads at run time carry it: the lens-prompts `{class-trace}` placeholder and the code
// checklist, the TRACE rule (UNTRACED is a lead), the data seat's role line, SKILL.md Step 1, GATE 1's TARGET block,
// the Grants table's network row (main's alert read is its one named exception) and the References table (MANDATORY).
// WHAT IT CANNOT BIND: that a model fetches, walks or traces (prose), or that a provider's endpoint still works (each
// request form is flagged unverified in the reference and re-checked live by the data seat).
// FOURTH TENSE: an edit that reverses a sentence and keeps its anchor words is not caught.
import { parseSeatLedger } from './seat-rights.mjs';

const CLASSES = ['alerts', 'catalogue', 'live-db', 'posix-seat'];
const strip = (c) => c.replace(/\*\*/g, '').trim();

export function parseSourceLedger(text) {
  const rows = {};
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const id = /^\*\*([ACLE]\d)\*\*$/.exec(cells[0] || '');
    if (!id || cells.length < 8) continue;
    rows[id[1]] = { source: cells[1], klass: strip(cells[2]), by: cells[3].split('·').map((t) => strip(t).toLowerCase()).filter(Boolean), right: strip(cells[4]).toLowerCase(), carries: cells[5], never: cells[6], unreachable: cells[7], raw: line };
  }
  return rows;
}

export function checkSourceSet({ files }) {
  const findings = [];
  const get = (rel) => files.find((f) => f.rel === rel);
  const ref = get('skills/coalboard/references/source-set.md');
  const skill = get('skills/coalboard/SKILL.md');
  const lens = get('skills/coalboard/references/lens-prompts.md');
  if (!skill) return ['skills/coalboard/SKILL.md not supplied to the source-set gate'];
  if (!ref) return ['skills/coalboard/references/source-set.md is missing: the data seat reads nothing past the model cut-off and no class is walked source to sink'];

  const rows = parseSourceLedger(ref.text);
  const ids = Object.keys(rows);
  const seats = parseSeatLedger(skill.text);
  const holders = (cell) => Object.keys(seats).filter((s) => seats[s][cell]);
  const mayExecute = { execute: ['main'], fetch: holders('fetch'), run: holders('run'), read: Object.keys(seats) };

  for (const k of CLASSES) if (!ids.some((id) => rows[id].klass === k)) findings.push(`the ledger has no row of class \`${k}\``);
  if (!ids.some((id) => rows[id].klass === 'live-db' && rows[id].right === 'fetch')) findings.push('no live-db row is read by a fetch');
  for (const id of ids) {
    const r = rows[id];
    if (!CLASSES.includes(r.klass)) findings.push(`${id}: unknown class \`${r.klass}\``);
    if (!mayExecute[r.right]) { findings.push(`${id}: unknown right \`${r.right}\` (execute, fetch, run or read)`); continue; }
    if (r.by.length === 0) findings.push(`${id} names no actor`);
    for (const actor of r.by) {
      if (!mayExecute[r.right].includes(actor)) findings.push(`${id}: \`${actor}\` is asked to ${r.right}, but only ${mayExecute[r.right].join(', ') || 'no seat'} hold that right (P19: a row may not widen a seat)`);
    }
    if (!/NOT-CHECKED|NOT-WALKED/.test(r.unreachable)) findings.push(`${id} says nothing named NOT-CHECKED or NOT-WALKED when its source is unreachable`);
    if (!r.carries) findings.push(`${id} states nothing it carries`);
  }
  for (const id of ids.filter((x) => rows[x].klass === 'alerts')) {
    if (rows[id].by.join() !== 'main') findings.push(`${id}: alert rows are main's alone (a credential must never reach the seat that can fetch)`);
  }
  if (rows.A3 && !(/\bnever\b|\bever\b/i.test(rows.A3.never) && /\bvalue\b/i.test(rows.A3.never))) findings.push('A3 (secret-scanning) must say a secret VALUE is never carried');
  // The vendor's endpoint returns the literal secret unless asked not to, so the promise holds only through the request form.
  for (const id of ids.filter((x) => rows[x].klass === 'alerts')) {
    if (/\bvalue\b/i.test(rows[id].carries)) findings.push(`${id}: an alert row's carries cell must not name a value (it carries fields, never a secret value)`);
  }
  // Built, not written adjacent: a literal `key=value` of this shape reads as an assignment to the house secret scan.
  const HIDE_SECRET_PARAM = 'hide_secret' + '=true';
  if (rows.A3 && !rows.A3.raw.includes(HIDE_SECRET_PARAM)) findings.push('A3 must name its request form with `hide_secret=true` (the endpoint returns the literal secret by default)');
  if (!/discarded unread/.test(ref.text) || !/without `hide_secret=true` is NEVER sent/.test(ref.text)) findings.push('source-set.md must state that a secret-scanning request without `hide_secret=true` is never sent and a response still carrying a `secret` field is discarded unread');
  if (rows.E1) {
    if (!/ONLY inside a box/.test(rows.E1.raw)) findings.push('E1 must keep "ONLY inside a box" (the POSIX run never happens on the host)');
    if (!/\bS4\b/.test(rows.E1.raw) || !/S1-S3/.test(rows.E1.raw)) findings.push('E1 must name run-safety S4 (the box) and its S1-S3 limit');
    if (!/environment/i.test(rows.E1.unreachable)) findings.push('E1 must name the unreachable case as an ENVIRONMENT gap');
  }

  if (lens) {
    const lines = lens.text.split('\n');
    if (!lines.some((l) => /^- `\{class-trace\}`/.test(l))) findings.push('lens-prompts.md has no `{class-trace}` placeholder entry');
    if (!lines.some((l) => /^- \*\*code:\*\*/.test(l) && /\{class-trace\}/.test(l))) findings.push('the lens-prompts.md code checklist does not walk `{class-trace}`');
    if (!lines.some((l) => /^- \*\*TRACE/.test(l) && /UNTRACED/.test(l) && /source-set\.md/.test(l))) findings.push('lens-prompts.md has no FIXED TRACE rule (UNTRACED is a lead, never CRITICAL or HIGH alone)');
    if (!lines.some((l) => /^- \*\*sub1/.test(l) && /source-set\.md/.test(l))) findings.push('the sub1 (data) role line does not point at the L rows of references/source-set.md');
  } else findings.push('lens-prompts.md not supplied to the source-set gate');

  const sl = skill.text.split('\n');
  if (!sl.some((l) => !l.startsWith('|') && /references\/source-set\.md/.test(l) && /A1-A3/.test(l) && /NOT-CHECKED/.test(l))) findings.push('SKILL.md Step 1 has no rail that builds the alert brief (A1-A3) and names an unreachable source NOT-CHECKED');
  if (!sl.some((l) => /\(1\) the TARGET/.test(l) && /source-set\.md/.test(l))) findings.push("GATE 1's TARGET block does not list the source set reachable this run");
  const net = sl.find((l) => l.startsWith('| network |'));
  if (!net) findings.push('SKILL.md Grants table has no network row');
  else if (!/A1-A3/.test(net)) findings.push("the Grants network row says main never fetches but does not name A1-A3, main's one read-only exception");
  const refRow = sl.find((l) => l.startsWith('|') && /references\/source-set\.md/.test(l));
  if (!refRow) findings.push('SKILL.md References table has no row for references/source-set.md');
  else if (!/MANDATORY/.test(refRow)) findings.push('SKILL.md lists references/source-set.md but not as MANDATORY at its moment');
  return findings;
}
