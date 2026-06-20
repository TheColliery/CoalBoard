# CoalBoard — the manual `/coalboard` setup wizard

Loaded ON-DEMAND on a manual `/coalboard` (auto skips it). TWO audiences — friendly to BOTH a layman AND a programmer, never one. CC `AskUserQuestion` (≤4 Q/call; numbered menu where none). Keep every surfaced line terse (paid each manual run); estimates you DERIVE for the target, never hardcoded. Then convene per SKILL.md Steps 1–4.

## LAYMAN-DEFAULT — the AI handles everything (the default path)
A non-programmer runs the board without knowing lens / rigor / depth.
1. **TARGET:** a path/cwd given → use it; else ONE plain question ("what should I check?" — cwd ✓ · a folder · the clean mirror).
2. **Scan silently** (enumerate-only + the exclude-floor below) → pick SAFE defaults: work-type = from the scan, depth = L2, rigor = standard, dispatch = all-at-once.
3. **ONE plain-language bill = the only question:** "I'll have 3 independent reviewers + a judge check [target] ([N] files) — about [Y] tokens. [Go ✓ · cheaper · more thorough · cancel]". NO opaque jargon ("cheaper / more thorough" map to depth/rigor under the hood; a universally-known word like "nasa" MAY appear — the test is "would a layman get it?", not "is it technical").
4. On Go → convene. Safety = staging + the human-apply gate (no rigor-knowledge needed to be safe).
- **Layman honesty (NEVER false confidence):** the result says what it checked + RAN + found AND what it could NOT verify, plus "for anything irreversible (money / security / data-loss) get a human / second opinion" — NEVER "this is safe, trust me". The help is real (it RUNS the tests + auto-rigor + staging), not infallible — see SKILL.md honest-ceiling.

## PROGRAMMER — full control (opt-in: "advanced" / stating prefs / config), the restaurant flow
**order → bill → pay** — the bill comes AFTER the order (you cannot price picks not yet made):
- **Call 1 — TARGET (asked FIRST, before any scan):** cwd ✓ · clean mirror (`Colliery/`) · subproject · path · diff · configured (path/diff → 2nd slot). Then read VERSION from the target's OWN files; note SOURCE vs install-clone (sets report location — `audit.md`).
- **Scan (silent · enumerate-only · ONE line):** classify by extension/path, NO content read (content = the lens phase). **EXCLUDE = `excludePaths` (config) ∪ the always-hard dev-contamination floor** (`CLAUDE.md`/`MEMORY.md`/`AGENTS.md`/`.claude/`/`.agents/`). **`.github` + any `workflows/` = a real UNIT + SECURITY surface.** FRESH (no prior-`audit-*.md` read). Surface: `Scanned: N files · class · source|clone · report→path · prior-audit?`.
- **Call 2 — the 3 settings (batched):** WORK-TYPE (scan-derived · ASK — the only scope-narrowing) · DEPTH (L1 · L2 ✓ · L3 ~3-4×) · RIGOR (relaxed · standard ✓ · high · nasa; per-instance, never written to config).
- **Bill → Call 3 — confirm:** compute the ACCURATE cost FROM the picks → show the bill (target · N files · resolved config · model-per-lens · ~cost) → ONE question: confirm ✓ · change · cancel. Spawn the first lens ONLY on confirm. DISPATCH defaults all-at-once (config-overridable; ask only if raised). Boarding-scope: interlinked → whole-connected, units enumerated FROM the scan (count units incl `.github`, never "the tools").

## Fill the lens prompts · convene · result
Resolved values (default OR pick) substitute MECHANICALLY into `references/lens-prompts.md` placeholders — NEVER free-write a lens prompt. Model = the deterministic `rigorLensTiers` table (SKILL.md Step 1). Convene (SKILL.md Steps 1–4); the RESULT → the apply decision (SKILL.md Step 4: digest → ONE-question consent → conditional write). All internal mechanics (template fill · memory arm) run SILENTLY — surface only decisions + results.
