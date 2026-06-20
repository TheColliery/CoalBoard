# CoalBoard — the manual `/coalboard` setup wizard

Loaded ON-DEMAND on a manual `/coalboard` (the auto path skips it). Drive setup in **2 question-box calls** (CC `AskUserQuestion`, ≤4 Q/call; a numbered menu where none) — never 8 separate round-trips. Defaults ✓; estimates you DERIVE for the target, never hardcoded. Then convene per SKILL.md Steps 0–4. Keep narration terse — every surfaced line is paid each manual run.

## Call 1 — TARGET (asked FIRST, before any scan / read / spawn)
Never assume cwd and scan — ASK first. Terse options, one line each: **cwd ✓** · clean mirror (e.g. `Colliery/` — no dev-contamination) · subproject · path · diff · configured target. A path/diff pick → take the path/ref as the call's 2nd question. WAIT; then read the target's VERSION from its OWN files (`plugin.json`/manifest, never memory) + note SOURCE vs transient install-clone (sets report location — `audit.md`).

## Scan (silent · enumerate-only · ONE summary line)
ENUMERATE + classify by extension/path, **NO content read** (content is the LENS phase — reading now burns 200k+ before a lens runs). `git ls-files` if git, else the tree. **EXCLUDE = `excludePaths` (config) ∪ the always-hard dev-contamination floor** (`CLAUDE.md`/`MEMORY.md`/`AGENTS.md`/`.claude/`/`.agents/` — never boarded; config adds, never weakens). **`.github` + any `workflows/` = a real UNIT + a SECURITY surface** (count + audit, never "just CI"). FRESH — never auto-read a prior `audit-*.md`. Surface ONE line: `Scanned: N files · <class> · source|clone · report→<path> · prior-audit: none|<age>`.

## Call 2 — WORK-TYPE + DEPTH + RIGOR + PROCEED (4 Q, one call)
Precede the call with ONE cost line: `~<Xk> tok at the defaults (All · L2 · standard · <N> lenses [model per role]); L3 ×3-4 · nasa adds gates`. Then the 4 questions:
1. **WORK-TYPE** (scan-derived · ASK, never auto-set): All ✓ · coding · doc · other. The ONLY scope-narrowing — lenses never sub-divide within it.
2. **DEPTH** (the primary cost lever): L1 surface · L2 ✓ · L3 deep (every line; ~3-4× cost).
3. **RIGOR:** relaxed · standard ✓ · high · nasa (a preset; a per-run pick is PER-INSTANCE, never written to config).
4. **PROCEED:** confirm ✓ · change · cancel. The submission IS the spend-consent (the cost line was shown) — spawn the first lens ONLY on confirm. `change` → recompute the PRECISE per-config estimate + re-ask once (precision on demand); `cancel` → abort, no spawn.

**DISPATCH is not asked** — default `all at once` (a speed-only choice, rarely changed; `maxConcurrentSubagents` caps it; ask only if the user raises it). **Boarding-scope:** interlinked subprojects → board whole-connected, enumerating UNITS **FROM the scan** (count units incl `.github`, never re-derive "the tools" — the skip-bias); a single unit needs no scope question.

## Fill the lens prompts · convene · result
Resolved values (default OR pick — the template doesn't care which) substitute MECHANICALLY into `references/lens-prompts.md` placeholders (`{target}` · `{version}` · `{scope+excludes}` · `{work-type-checklist}` · `{rigor}` · `{depth}`) — NEVER free-write a lens prompt. Model assignment = the deterministic `rigorLensTiers` table (SKILL.md Step 1), an orchestration param. Then convene (SKILL.md Steps 1–4); the RESULT → fix (stage → apply-consent) or report-only.
