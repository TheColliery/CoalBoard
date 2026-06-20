# CoalBoard — the manual `/coalboard` setup wizard

Loaded ON-DEMAND when the user runs `/coalboard` (the auto-trigger path skips this — it convenes directly per SKILL.md Step 0). The 8 steps below; each CHOOSE is the platform's question-box (CC `AskUserQuestion`; a numbered menu where none) with the factory default marked `✓`. Steps may be batched into fewer question-box calls (`AskUserQuestion` takes ≤4 questions), but the user picks every value. Numbers are runtime estimates you DERIVE for the chosen target — never hardcoded. After the wizard, convene per SKILL.md Steps 0–4.

## 1 — TARGET (asked FIRST · before any scan / read / spawn)
**Ask the target before doing ANYTHING else — do NOT scan, read target contents, or "cheap-scan cwd to understand it first".** The user picks; never assume cwd and start scanning. Options: **cwd repo/path (default ✓)** · a **clean export / mirror** (e.g. the offline `Colliery/` shipping view — no dev contamination) · a **subproject** · a **path** · a **diff** · a pre-configured target from config. WAIT for the choice; only THEN does Step 2 scan THAT target. (Why first: cwd is often a contaminated dev workspace, or the user wants the clean mirror / one subproject — assuming cwd wastes tokens on the wrong target.) After the pick, read the chosen target's VERSION from its OWN files (`plugin.json` / manifest), never from your context / MEMORY; note SOURCE vs TRANSIENT install-clone (decides report location — `audit.md`).

## 2 — SCAN + CLASSIFY the chosen target (CHEAP · enumerate-only · AFTER Step 1 · before any spawn)
Scans only to INFORM the next questions + the cost estimate — it decides nothing for the user. **ENUMERATE + classify ONLY — NEVER read file CONTENTS here.** Content-reading is the LENS phase's job; reading it now burns 200k+ tokens before a single lens runs AND bloats main's context → overflow.
- **Git OPTIONAL** — a non-git target works (enumerate the tree); with git, `git ls-files` = the tracked ground truth.
- **EXCLUDE = `excludePaths` (config) ∪ the always-hard dev-contamination floor.** The HARD floor — `CLAUDE.md`/`MEMORY.md`/`AGENTS.md`/`.claude/`/`.agents/` — is excluded REGARDLESS of config (the agent SEES it but a GitHub user does NOT; a lens reading it inherits the dev's blind spot). `excludePaths` ADDS the build/vcs dirs (`.git`/`.coalboard/`/`node_modules`/`dist`/`vendor`/`build`) and is TUNABLE — but it can never REMOVE the floor (config adds, never weakens). READ it from the merged `.coalboard.json`; do NOT hardcode the list here.
- **`.github` — distinguish a bare config-dir from a real repo/workflows (SECURITY):** a `.github/` that is only issue-templates/config inside a normal repo = low-priority skim; BUT a top-level `.github` REPO, or ANY dir holding `workflows/`, is COUNTED + AUDITED FULLY — it carries the landing/installer and **workflows are a SECURITY surface** (action SHA-pins · scan/action VERSION correctness · `pull_request_target` + untrusted checkout · `${{ github.event.* }}` injection · over-broad `permissions`). A repo named `.github` legitimately nests `.github/.github/workflows/` (ground via `git ls-files` — not a path bug). SIGNAL = workflows present / a real top-level repo → never skip it as "just CI".
- **FRESH** — never auto-read a prior `audit-*.md` into context (version-stale; `audit.md`).
- **CLASSIFY = extension/path ONLY** (`.mjs`/`.ts`→code · `.md`→doc · `SKILL.md`→spec · `.yml`/config→config · `workflows/*.yml`→CI-security) — NO content read. Head-read ONLY a genuinely ambiguous file (extensionless / unknown format); the full read is deferred to DEPTH (the lens phase).

## 3 — WORK-TYPE (ASK · options derived from the scan · never auto-set)
`All / mixed ✓` · `coding` · `doc` · `other` (math/research/translation…). **The scan may reveal a mixed repo, but you STILL ASK — never silently auto-pick** (R2-2). Work-type is the ONE scope-narrowing: `doc` → the doc files are in scope, `code` → the code files, `All` → every file. Within the chosen scope the lenses NEVER sub-divide (SKILL.md Step 1) — all lenses examine ALL in-scope files together, never split by file-type / name / category.

## 4 — DEPTH (the READ axis · ⊥ rigor · the primary cost lever)
`L1 surface` (heads + structure + changed set) · `L2 standard ✓` (read in-scope files; debate the flagged) · `L3 deep` (read EVERY line for coverage; debate flagged + cross-file, not literally per-line).

## 5 — RIGOR
`relaxed` · `standard ✓` · `high` · `nasa` — the preset bundling adversary lens / sub4-on-consensus / contested-round / ground-truth gates / consent strictness (SKILL.md "Always"). A per-run pick is PER-INSTANCE (never written to config).

## 6 — DISPATCH (how the lenses run)
`all at once ✓` · `one-at-a-time` · `N` — a SPEED choice only. **BLIND (spec-only · main is never a lens) is the independence requirement; parallel just makes it faster — one-at-a-time is equally independent, only slower.** Run the chosen count under `maxConcurrentSubagents`. This is NOT "split the scope" — the lenses never divide the work.

## 7 — COST-CONFIRM (the pre-flight checkpoint)
Summarize ALL choices + the TARGET line (path · version · source-vs-clone · any stale prior audit) + the RECOMPUTED token estimate → CONFIRM / CHANGE / CANCEL. Spawn the FIRST worker ONLY on confirm. (Convene + config + cost + report-location gate — NOT the apply decision; that is Step 4, after findings exist.) **Cost model:** the pre-spawn scan is CHEAP (enumerate + classify, no content read); the REAL cost is the LENS phase = file-count × DEPTH (L3 = every line). Reduce it via DEPTH (L2/L1) · WORK-TYPE (narrow the set) · per-unit boarding — never by silently under-scoping.

## 8 — RESULT
After the board runs (SKILL.md Steps 1–4): present the digestible summary → **fix** (stage → apply-consent) or **report-only**.

## Filling the lens prompts (R2-10)
The wizard's RESOLVED values (factory default OR the user's pick — the template doesn't care which) substitute MECHANICALLY into the canonical lens-prompt template at `references/lens-prompts.md` — NEVER free-write a lens prompt (free-writing is what leaked dev-governance + caused per-lens asymmetry). Prompt-body placeholders: `{target}` · `{version}` · `{scope + excludes}` · `{work-type checklist}` · `{rigor}` · `{depth}`. Orchestration params (NOT prompt-body): the DISPATCH count (Step 6) + the model assignment (SKILL.md Step 1 deterministic rule). Flow: **wizard collects → scan derives → substitute into the template → spawn.**

## Boarding-scope (interlinked target)
If the chosen target is interlinked subprojects, ASK **whole-connected ✓** (board as ONE continuous run so the lenses keep cross-link visibility; a per-folder silo misses a cross-unit signal) vs **per-unit**. **ENUMERATE the units FROM THE STEP-2 SCAN** (`git ls-files` / the dir tree) — every top-level repo/dir in range, **counted as UNITS, NEVER re-derived as "the tools"** (the products-mental-model is the skip-bias that silently DROPS `.github` — a real repo carrying landing/benchmarks/installer/workflows, not "just infra"). `.github` is a unit like any other; show the unit COUNT + file count from the scan, never a product list. Control whole-run cost via DEPTH (step 4) + durable per-agent memory (SKILL.md), never by siloing.
