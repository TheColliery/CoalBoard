# CoalBoard — deep repo / release audit

Loaded ON-DEMAND for an Audit/Review of a repo or release (not a single diff). The lenses + debate + verify + sub4 + human all work as in SKILL.md; this adds what a code-only pass misses — a skill can be CORRECT while its repo is not.

## What a code-only pass misses
- **Internal consistency** — the stated version agrees across the manifest, CHANGELOG, docs, and tag; the config the docs tell users to copy actually produces the behavior the docs promise; CI / hygiene files match the project's OWN stated conventions. (Multi-package or sibling components MEANT to share a setup → check they do; skip cleanly when there are no siblings — never assume a layout the project lacks.)
- **Live findings are unresolved findings** — IF the platform surfaces code-scanning / dependency / secret alerts, an open one is NOT "clean": triage each (fix, or dismiss WITH a documented reason). Query where you can; never assume zero. (Skip cleanly when there is no such platform.)
- **Showcase completeness** — is the change reflected wherever the project presents itself (README, docs, a landing page), IF such a surface exists? A shipped thing missing from where users look is a finding.
- **Scope every verdict (honesty)** — "NO ERROR FOUND" states WHAT was audited (this diff · the skill surface · the whole repo). An un-audited dimension is **"not checked", never "clean"** — a blanket "no error" over an un-inspected scope is the false confidence the board exists to kill.

## Enumerate the scope — every file, scope-contained (#12 · #13)
- **A deepest / "Everything" scope covers EVERY file in range — enumerate the ACTUAL files** (`git ls-files`, or the tree if non-git), NOT a fixed extension list (a type list silently misses `LICENSE`, a dotfile, a new format). "Every file, any extension" — code, docs, config, memory, prose, design — equal rigor; do not let the lenses gravitate to code bugs and skim the non-code surfaces.
- **INCLUDE `.github`** (landing / benchmarks / docs / installer) — counter the skip-bias. A repo named `.github` legitimately nests `.github/.github/workflows/`; ground via `git ls-files` before flagging it a path bug (a solo agent false-positived exactly this).
- **Scope-containment (#13):** anchor EVERY glob to the target root — `<target>/**/*.ext`, never a bare `**/*.ext` that escapes the boundary (seen wandering into `**/SkillSpector/**`). Resolve-and-CONTAIN (`path.resolve` + `path.relative`, reject any `..` that climbs out), not segment-scan (`split('/')` misses `\` on Windows).

## Interlinked subprojects = ONE connected whole (#15)
When the target is a set of interlinked subprojects (shared governance, cross-refs, a spanning installer), board it as ONE LONG continuous run — do NOT split per-folder. The lenses keep cross-link visibility, so a cross-unit signal surfaces (e.g. "the installer omits subproject X" — a silo would miss it). Control cost via DEPTH + durable per-agent memory (SKILL.md Memory & resume), never by siloing. (The wizard's boarding-scope step offers whole-connected vs per-unit; whole is the default when interlinked.)

## No stale prior-audit READ (#11)
Each run is FRESH. NEVER auto-pull a prior `audit-*.md` into context — the gitignored `.coalboard/` survives `claude plugin update`, so a stale clone-audit reads as "latest" (one was 2 versions stale). A prior audit is **de-dup CONTEXT only**: re-verify EVERY prior finding against the CURRENT source (it may be fixed), version-check it (a report older than the target's version is SUSPECT, not ground truth), and NEVER inherit its verdict. A root-level audit not under `reports/` is a pre-`reports/` leftover (likely stale). Keep the report-WRITE; drop the READ-into-context.

## Audit-independence + where the report lives
- **Independence:** auditing your OWN repo from the dev session loads that repo's `CLAUDE.md` / `MEMORY.md` into the board's context → it is then NOT uninvolved (it sees your plans/jargon and may read a fact from MEMORY instead of the target). For a clean pass, run from a NEUTRAL context (the governance does not load) and ground every fact in the TARGET's own files.
- **Report location:** the `reports/` sibling of the staging dir, **INSIDE THE PART THAT WAS SCANNED** — SCOPE decides location: a whole-repo audit → the repo root's `reports/`; a single-subproject audit → that subproject's `X/.coalboard/reports/` (co-located with X, never a parent / umbrella / catch-all root). Filename TIMESTAMPED + unique: `audit-YYYY-MM-DD-HHMMSS[-vX.Y.Z].md` from the platform clock (never date-only — two same-day runs must not collide). NOT into `proposed/` (that is changes-to-apply).
- **TRANSIENT clone:** if the target is an install-clone whose dir is overwritten on `claude plugin update`, its `.coalboard/` would be wiped → write the report to a PERMANENT path the user picks instead.

## Self-audit honesty (the cross-platform claim)
Auditing CoalBoard ITSELF: its "cross-agent / works on platform X" claim is an UNVERIFIED self-claim — sub1 flags it, sub3 demands "show it run on X", and a board running on ONE platform shares a blind spot about the others (the human on another platform is the out-of-frame check). A **CLAIM-vs-DOCS mismatch is a finding in ANY audit**: if the docs claim "cross-platform" but the install/examples/config cover ONE platform only, that gap is a defect — the docs must document the others or SCOPE the claim ("verified on X; others by design, unverified").
