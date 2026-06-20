# CoalBoard — the manual `/coalboard` setup wizard

Loaded ON-DEMAND when the user runs `/coalboard` (the auto-trigger path skips this — it convenes directly per SKILL.md Step 0). Walk the 8 steps in order. **Every CHOOSE = the platform's question-box** (CC `AskUserQuestion`; a numbered text menu where none), with the recommended option marked `✓`. Numbers shown are runtime estimates you DERIVE for this target — never hardcoded. Then convene per SKILL.md Steps 0–4.

## 1 — TARGET
What is under the board? Default = the cwd repo/path; offer an override (another path, a subproject, a diff, a named file). Read its VERSION from the target's OWN files (its `plugin.json` / manifest), never from your loaded context / MEMORY. Note SOURCE repo vs TRANSIENT install-clone — it decides where the report lands (see `audit.md`).

## 2 — SCAN + CLASSIFY (cheap, before any spawn)
- **Git is OPTIONAL** — a non-git target works (enumerate the tree directly); if git is present, `git ls-files` is the ground truth for "what's tracked".
- **EXCLUDE** = the `excludePaths` config key with a FACTORY DEFAULT: `.git`, the dev-governance files (`MEMORY.md` / `CLAUDE.md` / `AGENTS.md` / `.claude/` / `.agents/`), `.coalboard/`, `node_modules`, `dist`. (These are machine-local / generated — auditing them is noise.)
- **INCLUDE `.github`** — it is a real top-level area here (landing, benchmarks, docs, `install.mjs`); counter the training-bias to skip it. A repo literally NAMED `.github` legitimately nests `.github/.github/workflows/` — that is NOT a path bug (ground it via `git ls-files` before flagging — an over-eager solo agent false-positived exactly this).
- **FRESH** — do NOT auto-read a prior `audit-*.md` into context (version-stale hazard; see `audit.md` #no-stale-read).
- **CLASSIFY = extension-first** (`.js`/`.mjs`/`.ts` → code · `.md` → doc · `SKILL.md` → spec · config → config), + a selective HEAD-read only for the ambiguous; the full read is deferred to the DEPTH you pick next.

## 3 — WORK-TYPE
All `✓` / coding / doc / other (math, research, translation, …). Sets the per-domain known-failure checklist + verify gates the lenses use.

## 4 — DEPTH (the READ axis — ⊥ rigor — the PRIMARY cost lever)
- **L1 surface** — heads + structure + the changed set.
- **L2 standard `✓`** — read the in-scope files; debate the flagged findings.
- **L3 deep** — read EVERY line for COVERAGE (tireless, no skim), but the DEBATE still concentrates on the FLAGGED + cross-file candidates, NOT literally per-line (per-line debate = mostly-empty + too expensive).

Depth is the read-effort knob; rigor (next) is the trust knob — they are independent.

## 5 — RIGOR
`relaxed` / `standard ✓` / `high` / `nasa` — the preset that bundles adversary lens · sub4-on-consensus · contested round · ground-truth gates · consent strictness (SKILL.md "Always"). A per-run pick here is PER-INSTANCE (never written to config).

## 6 — DISPATCH (how many lenses concurrently)
all `✓` / 1 / 2 / N — a CONCURRENCY choice only (the lenses are always BLIND + examine the SAME target; parallel buys speed, blind buys independence). The agent self-manages the waves under `maxConcurrentSubagents`. This is NOT "split the scope" — the lenses never divide the work.

## 7 — COST-CONFIRM (the pre-flight checkpoint)
Summarize ALL choices + the TARGET line (path · version · source-vs-clone · any stale prior audit) + the RECOMPUTED token estimate → CONFIRM / CHANGE / CANCEL. Spawn the FIRST worker ONLY on confirm (SKILL.md Step 0). This is the convene+config+cost+report-location gate — NOT the apply decision (that is Step 4, after findings exist).

## 8 — RESULT
After the board runs (Steps 1–4): present the digestible summary → **fix** (stage → verify → apply-consent) or **report-only**.

## Boarding-scope (when the target is interlinked — #15)
If the target is a set of interlinked subprojects (shared governance, cross-refs, a spanning installer), offer **whole-connected `✓`** (default when interlinked — board it as ONE LONG continuous run so the lenses keep cross-link visibility; a per-folder silo would miss a cross-unit signal like "the installer forgot subproject X") **vs per-unit**. Control the cost of a whole-connected run via DEPTH (step 4) + durable per-agent memory (SKILL.md Memory & resume), NEVER by siloing.
