# Changelog

All notable changes to CoalBoard are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer (the canonical version lives in `.claude-plugin/plugin.json`).

## [1.3.0] — 2026-06-21

Round-3 deep dogfood (the user ran the real published wizard + board as a customer and surfaced flow / honesty gaps the build gate cannot). **MINOR**: a new layman-default UX path + a holistic wizard/gate flow rework + model-diversity honesty corrections; no new config keys.

### Added
- **Dual-audience wizard — a LAYMAN-DEFAULT path:** `/coalboard` now defaults to AI-handles-everything — smart safe defaults (cwd · auto-work-type · L2 · standard) + ONE plain-language bill+confirm ("3 reviewers + a judge check X for ~Y tokens — go / cheaper / more thorough / cancel"; no opaque jargon — "cheaper/more thorough" map to depth/rigor, a universally-known word like "nasa" may stay). A programmer opts into the full restaurant wizard ("advanced" / stating prefs). The layman is kept safe by staging + the human-apply gate (no rigor-knowledge needed); the result carries the honest ceiling in plain language and never says "definitely safe".

### Changed
- **Wizard = the "restaurant" flow order → bill → pay** (programmer path): TARGET → silent scan → the 3 settings (work-type/depth/rigor) → the ACCURATE bill computed FROM the picks → ONE confirm. Fixes the v1.2.1 stale-cost consent (the bill used to precede the picks). DISPATCH defaults all-at-once.
- **Step 4 exit re-ordered + leaned:** DIGEST → ONE consent question (apply-all / let-me-pick / report-only / stop; "which fixes" only on "let-me-pick") → THEN write, CONDITIONAL on the choice (stop = write NOTHING). The report file is never written before consent. (Was: write-then-"consent gate", two questions.)
- **Surfaced output = decisions + results only** — internal mechanics (reading the lens-prompt template, arming/cleaning the memory net, the contract steps) run SILENTLY, never narrated.
- **Model-diversity honesty:** `diversifyModels` is INERT on Claude Code (the spawn tool takes only aliases — it cannot pin a model generation, so "spread across generations" is a no-op; kept degrade-safe for a platform that can). The only actuatable model-decorrelation on CC is a tier-mix (partial, at a lens-strength cost); the real decorrelation is the diverse lens prompts + adversary + sub4, never the model.
- **NASA honesty (the correlated-blind-spot ceiling):** all-opus at nasa = MAX model-correlation at MAX stakes — the escape is the non-model ground-truth gates (`tier2Verify` — fuzz/property/differential) + the human, NOT model-diversity and NOT sub4 (sub4 is the same model → shares the blind spot; it breaks deadlocks only). The skill no longer implies "nasa is safe because diverse models".
- **Warm-resume corrected (verified live):** the standard CC session has no callable SendMessage tool, so a stopped/dead lens is recovered by re-spawning a FRESH lens on the un-done REMAINDER tracked in main's journal (re-does only the in-flight partial); SendMessage-resume is a bonus only where the tool exists. `TaskStop` is available (main reaps a runaway / zombie sub).

### Fixed
- The org `.github` repo had no `dependabot.yml` — its workflows' pinned actions never auto-bumped (the same `.github` skip-bias, one layer down); added it (github-actions, weekly), matching the plugin repos. (R3A-3)

Gate: build + verify + 28 tests PASS.

## [1.2.1] — 2026-06-21

Wizard token-economy pass (dogfood: a sub RAN the manual `/coalboard` wizard while main watched, then trimmed the waste). **PATCH**: leaner manual-wizard UX, no new capability/config.

### Changed
- **Manual `/coalboard` wizard restructured to 2 question-box calls** (was up to 4 round-trips across 8 steps): Call 1 = TARGET → a silent enumerate-only scan (1-line summary) → Call 2 = WORK-TYPE + DEPTH + RIGOR + PROCEED (4 questions). 2 calls is the dependency FLOOR (TARGET → SCAN → scan-derived WORK-TYPE forces ≥2 round-trips). The cost-confirm folds into Call 2's PROCEED slot — a cost line precedes the call (informed consent); "change" recomputes the precise per-config estimate on demand.
- **DISPATCH is no longer a wizard question** — defaults to all-at-once (a speed-only choice, rarely changed; `maxConcurrentSubagents` caps it, ask only if the user raises it), freeing the slot for the confirm.
- **Terser throughout** — one-line option text, a single scan-summary line, no decorative filler. Every load-bearing ask is KEPT (target-first, ask-work-type, exclude ∪ the dev-contamination floor, `.github`/workflows security, units-from-scan, cost consent, the lens-prompt fill-flow). `references/wizard.md` prose ~−38%.

Gate: build + verify + 28 tests PASS.

## [1.2.0] — 2026-06-21

Round-3 dogfood (the user ran the board as a customer again + reported each finding) — deterministic rigor-scaled model tiering, a wired scan-exclude config key, `.github`/workflows treated as a security unit, and platform warm-resume. **MINOR**: new config keys (`rigorLensTiers`, a now-functional `excludePaths`) + new deterministic behavior.

### Added
- **`rigorLensTiers` — a deterministic rigor→lens-tier map** (factory `relaxed/standard → haiku · high → sonnet · nasa → opus`). The lens model now SCALES with rigor and the agent READS the table verbatim, so the assignment is identical every run — fixing both the all-haiku-at-nasa under-powering and the run-to-run non-determinism ("deterministic" is now EARNED by the table, not printed over interpreted prose). The judge stays top-tier; the adversary always takes the rigor tier (≥ sonnet), never undetermined.
- **`excludePaths` is now a FUNCTIONAL scan/audit exclude** (was reserved/inert). The factory default unions the build/vcs dirs with the always-hard dev-contamination floor (`CLAUDE.md`/`MEMORY.md`/`AGENTS.md`/`.claude`/`.agents`); config ADDS to the floor, never weakens it (a lens must never read the dev governance). The scan READS it from config instead of a hardcoded prose list.

### Changed
- **Adopt CoalTipple's ranking pattern (OPTIONAL, series-interop):** if CT is installed, inherit its `ranking.json` (alias-floor authority + stable tier-structure + `modelTiers` pins + validity-lock + spawn-fail-fall); else the alias floor + `rigorLensTiers` suffice — CB stands alone. CB adds only the rigor→tier map + the adversary bump.
- **`.github` / workflows = a SECURITY unit, never "just CI"** — the scan classifies `workflows/*.yml` as CI-security; the lens checklist + audit reference now flag action SHA-pins, scanned/action version correctness, `pull_request_target` + untrusted checkout, `${{ github.event.* }}` injection, and over-broad `permissions`. Boarding-scope enumerates UNITS from the scan (`.github` counted as a first-class unit), never re-derives "the tools" (the recurring `.github` skip-bias).
- **Pre-spawn scan is ENUMERATE-ONLY** — classify by extension/path with NO content read (content-reading is the lens phase); avoids burning 200k+ tokens and bloating main's context before any lens runs.
- **Warm-resume PREFERS platform resume over re-spawn-fresh** — capture each lens's `agentId` and SendMessage-resume a dead/limit-hit lens (keeps its accumulated work) instead of re-spawning from scratch (which re-does the lost work). Trigger the resume on budget-RETURN (quota reset OR a user refill, whichever first), never a hardcoded clock; any scheduled resume is idempotent.
- **Judge narration** — the board states "judge running ground-truth to settle the conflict, not acting as a lens" so a watcher is not alarmed when main works post-collapse; after a budget-collapse to an inline judge, the dead lens's domain is flagged NOT-CHECKED, never inline-generated.

### Fixed
- The CT/CB issue-template version placeholders were stale (`v1.0.0`) and ungated → replaced with a number-free `vX.Y.Z` format hint that cannot rot.

Gate: build + verify + 28 tests PASS.

## [1.1.0] — 2026-06-21

Round-2 dogfood (the user ran the board as a customer + reported each finding) — the manual `/coalboard` wizard + lens-spawning hardened. **MINOR**: new capability (a canonical lens-prompt template + the wizard's target-first / ask-work-type flow + manual-board memory arming + deterministic model assignment + deadlock handling).

### Added
- **`references/lens-prompts.md` — the canonical lens-prompt TEMPLATE.** main fills `{target}` / `{scope}` / `{work-type-checklist}` / `{version}` placeholders, NEVER free-writes a prompt. Fixed rules: ground every lens in the TARGET's OWN files + FORBID injecting loaded dev-governance (the independence break the board exists to avoid); "seeds, not exhaustive" on EVERY lens (not just show-me/adversary); calibrated + FALSIFIER + NOT-CHECKED honesty; the deterministic model rule.

### Changed
- **Wizard (`references/wizard.md`) rewritten to the authoritative 8 steps:** Step 1 TARGET is asked FIRST, before any scan (no more "cheap-scan cwd before asking") — offers cwd / the clean mirror / a subproject / path / diff. WORK-TYPE is ASKED (never auto-set) and is the ONLY scope-narrowing. DISPATCH is a speed choice (BLIND = the independence; parallel just faster; one-at-a-time equally independent). The fill-flow (wizard values → template) is explicit.
- **Lenses NEVER sub-divide the scope** by file-type / name / category / work-kind (SKILL.md Step 1 sharpened) — all lenses examine all in-scope files together.
- **Model assignment is DETERMINISTIC + identical across every unit** (cost-bonus haiku-lenses + opus judge; `diversifyModels` spreads GENERATIONS not TIERS; Fable excluded) — never an arbitrary per-unit spread.
- **Memory & resume:** ARM whenever a board is convened (manual = the full per-agent net; auto = CoalHearth-light, degrade-safe) — supersedes the "long-runs-only" gate; per-agent private + cross-read-forbidden; a sub self-resumes (or main re-spawns the remainder on a read-only platform); **EPHEMERAL** — `.coalboard/memory/` is deleted on completion (Phoenix #1 zero-garbage).
- **Deadlock (sub4):** a sub4-resolved tie is USED directly (no extra blocking gate — a layman can't adjudicate a deep deadlock) but FLAGGED lower-confidence at the apply gate; the full deadlock detail goes in the report; a 3-way split still escalates to the human.

### Fixed
- README status was stale (`v1.0.12`) vs `plugin.json`.

Gate: build + verify (the new reference is in the SHIP list) + 27 tests PASS.

## [1.0.13] — 2026-06-20

The load-path **carve** — the series token-economy pilot ([skill-authoring](https://github.com/TheColliery/.github) §4): the SKILL.md body is now the LEAN always-loaded core (auto-trigger AND manual both pay only this); the heavy manual-only / deep detail moved to `references/*.md`, loaded ON-DEMAND. **Core body −40% (19433 ← 32372 chars)** — a board that auto-convenes no longer pays the manual wizard's tokens. Plus the Phase-3 robustness items folded in. (CB is the pilot; the carve rolls to CoalTipple + CoalMine next.)

### Added
- **`references/wizard.md`** — the manual `/coalboard` 8-step setup wizard (target · scan/classify · work-type · depth · rigor · dispatch · cost-confirm · result + interlinked boarding-scope), loaded only on a manual convene.
- **`references/audit.md`** — the deep repo/release audit detail (every-file enumeration · `.github` inclusion · scope-containment · interlinked-whole boarding · no-stale-prior-audit · scope-aware report-location), loaded only on an audit run.
- **Platform/version gate** — CoalBoard is a capability-hack tightly coupled to the exact platform + version (docs ≠ reality); on any platform/version not actually run, it now announces UNVERIFIED, degrades conservatively, and surfaces the risk to the human before spending.
- **Durable per-agent memory & warm-resume — LONG runs only** — for a deep/L3 or whole-interlinked-repo run that can overflow: per-agent PRIVATE `.coalboard/memory/<agent>.md` (cross-reading forbidden), incremental checkpoint, warm-resume on overflow/compaction/503 (a sub resumes from pending, never restart). A short single board skips it (no-overkill).

### Changed
- **SKILL.md carved to a lean core** — every behavior preserved; manual/deep detail relocated to `references/` (loaded on demand, not resident every convene).
- **Lens-failure recovery hardened** — a tripped lens is re-spawned on an available model or resumed from pending; main NEVER does a lens's own work (that collapses the decorrelation that IS the board's value); never restart-from-scratch.
- **Never assign an unavailable model** — a spawn-failure / 0-token "Completed" (COMPLETED ≠ ANSWERED) is classified + re-routed; an access-gated model (Fable) is dropped from the pool, never re-picked.
- **Tool-error fail-fast** — a lens hitting an unavailable tool returns immediately (no workaround loops burning tokens); lens contracts are kept tool-agnostic.

### Fixed
- **`/coalboard` "Unknown command" — the redundant `commands/coalboard.md` removed.** It and the skill both claimed `/coalboard:coalboard` (a command and a same-named skill are merged by the platform); the skill is now the single entry — auto via its description, manual via `/coalboard:coalboard` (which reads the wizard). `/coalboard:update` is unaffected.

Gate: build + verify (9/9, incl. dist-sync of the two new references) + 27 tests PASS.

## [1.0.12] — 2026-06-20

The session-end rot-canary caught two LOW issues in the v1.0.11 scrubber additions (the scrubber's own rot).

### Fixed
- **scrubber over-length leak (same class as the google-key fix):** the v1.0.11 npm / GitLab / SendGrid / Square patterns used exact `{N}` + trailing `\b`, so an OVER-LENGTH token-shaped run fails the boundary and leaks the WHOLE token. Switched to `{N,}` (every pre-existing pattern already used it). +test.
- **AccountKey re-casing:** the Azure pattern hardcoded `AccountKey=` in the replacement, so a lowercase `accountkey=` was re-cased in the output. Now captures the key (`$1[REDACTED]`) to preserve the original casing. +test.

(Both LOW, in the DEV-only `secrets.mjs`; caught by rot-canary at session end, not the gate.) Gate: build + verify PASS + 25 tests.

## [1.0.11] — 2026-06-20

Consolidated pass — executes the board's v1.0.9 re-audit findings (top open = scrubber gaps + SECURITY scan honesty) as ONE release, plus the report-location scope fix. No catastrophic findings; core safety held throughout.

### Fixed
- **secret-scrubber (`secrets.mjs`) format gaps:** added npm (`npm_`), GitLab (`glpat-`), SendGrid (`SG.`), Square (`sq0atp-`), and Azure storage `AccountKey=`; the Google-key pattern is now open-ended (`{35,}`) so an over-length run is FULLY redacted (was `{35}` → leaked the tail); the PEM block match is case-insensitive. (This is the DEV reference scrubber — defense-in-depth, not shipped in the runtime.)
- **`diversifyModels` example still named "Fable 5" in `config-schema.mjs`** — v1.0.5 dropped it from the SKILL + factory but MISSED the schema SOT → generalized to "available generations".
- **conductor over-fired on non-SessionStart events:** the SessionStart branch now gates on `event === 'SessionStart'`; any other non-prompt event stays silent (Phoenix #13). +test.
- **SECURITY.md scan note clarified:** separates the actual scanned version (v1.0.1), the re-scan policy, and an explicit "later versions not re-scanned" honest scope (no all-versions guarantee).
- **`excludePaths` schema help marked RESERVED** (it feeds only the optional, unwired PreToolUse backstop — the factory already said so; the schema text now matches).
- **CONTRIBUTING.md** headers de-emojified (series doc-standard).

### Changed
- **Report location is now scope-aware:** the report goes INTO the part that was scanned (`X/.coalboard/reports/` for subproject X), never a parent / umbrella / catch-all root — scope decides location.

Tests: 24 (+scrubber formats, +conductor over-fire guard).

## [1.0.10] — 2026-06-20

Dogfood — the apply decision was asked TWICE: the Step-0 convene gate surfaced "report-only", and the Step-4 post-audit gate asked "fix what?" again. Deciding what to fix before any findings exist is premature; report-only belongs after the findings.

### Fixed
- **The apply / fix / report-only decision is now a SINGLE gate at Step 4 (after findings).** Step 0 decides convene + config + cost + report-LOCATION (source vs clone) only — it no longer asks the apply mode (no findings yet → premature + duplicated). If the user pre-declares report-only (config / at convene), Step 4 honors it without re-asking.

Deferred: sub4 per-rigor doc · heading-order check · language re-flag · CONTRIBUTING emoji-strip.

## [1.0.9] — 2026-06-20

Dogfood — two issues: the SKILL leaned on CoalTipple as if always present (CoalBoard is standalone — a user may install only it), and a run announced "Step 1" twice (the pre-spawn prep, then the actual spawn).

### Fixed
- **CoalTipple is now explicitly OPTIONAL (no-external-assumption).** The board tiers models on the Claude Code alias floor (`haiku < sonnet < opus`) it knows directly, plus its own introspection + `lensTiers`; if CoalTipple is ALSO installed, its richer availability ranking is inherited as a BONUS. CoalBoard installed alone no longer reads as broken. (Fixed in Tiers, Bounds, and the grade-rubric reference.)
- **Step 1 is announced ONCE.** The target enumeration (file-list for the scope count) + the report's version/commit/timestamp stamp are the Step-0 pre-flight (the checkpoint), NOT a second "Step 1"; Step 1 is purely the spawn.

Deferred: sub4 per-rigor doc · heading-order check · language re-flag · CONTRIBUTING emoji-strip.

## [1.0.8] — 2026-06-20

Dogfood — the per-lens model display regressed: a run condensed it to a bare slash-list ("haiku/sonnet/sonnet/opus") in the narration, and the spawn chips showed only "empirical lens" etc., so you could not tell which model each lens was running on.

### Changed
- **Each lens's model is now mandated VISIBLE on its spawn.** Lead the worker's label / description with the model (+ effort) — `[haiku] empirical lens`, `[opus] adversary` — so the platform chip shows it (the chip shows the description, not the model). The per-lens → model mapping must be explicit and named, never a bare slash-list divorced from the lens names. (Mirrors the CoalTipple spawn-label rule.)

Deferred: sub4 per-rigor doc · heading-order check · language re-flag · CONTRIBUTING emoji-strip.

## [1.0.7] — 2026-06-20

Dogfood — the 2nd cost-gate reads like a pre-flight checkpoint but showed only the CONFIG (workers, models, gates, cost), never the TARGET. Added it.

### Changed
- **The cost-gate is now a TARGET + config + cost checkpoint.** Before spawning, it shows WHAT is under audit — repo/path, version read from the target's own `plugin.json` (not memory), source-repo vs transient install-clone (decides where the report lands), and any stale prior audit found there — alongside the final config and recomputed estimate. A wrong target (the clone not the source, a stale version) is caught AT the checkpoint, before the spend.
- **Prior-audit handling:** a prior audit found in the target is de-dup context ONLY — re-verify every prior finding against the CURRENT source, version-check it (a report older than the target's version is suspect), never inherit its verdict; a root-level audit not under `reports/` is a pre-`reports/` leftover.

Deferred: sub4 per-rigor doc · heading-order check · language re-flag · CONTRIBUTING emoji-strip.

## [1.0.6] — 2026-06-20

Continued dogfood — two errors found by READING the shipped artifacts (the report save-path, the README install block), both the class "the board audited SOUND but missed its own inconsistency". Fixed + sharpened so the board catches the class.

### Fixed
- **Staging-path inconsistency — the report location was undefined.** Docs said `.coalboard/proposed/` everywhere, but reports actually landed in `.coalboard/` root with no rule. Now explicit: `proposed/` holds ONLY changes-to-apply; the human-readable REPORT (audit / post-mortem) goes to `.coalboard/reports/<name>-<timestamp>.md` (a sibling of `proposed/`, never inside it). Synced across SKILL (Step 4.1 / 4.6 / audit-independence), PRIVACY, README.
- **README install was Claude-Code-only under a cross-agent claim.** The Install section now splits **Claude Code** (one command; hook + cost-tiering are CC-only) vs **other platforms** (point the agent at the platform-neutral `skills/coalboard/SKILL.md`) and states plainly that cross-agent operation is by design but VERIFIED on Claude Code only.

### Changed (audit sharpness)
- **Claim-vs-docs mismatch is now an explicit audit finding:** docs that CLAIM "cross-platform / runs anywhere / works on X" while the install, examples, or config cover only ONE platform = a defect; the docs must document the others or scope the claim. (CoalBoard's own README was exactly this.)

Deferred: sub4 per-rigor doc · heading-order check · language re-flag · CONTRIBUTING emoji-strip.

## [1.0.5] — 2026-06-20

Round-4 self-audit (nasa, whole repo; verdict SOUND, 0 code defect) + queued dogfood points. Headline catches: a dead lens marked "Completed" (0 tokens — model unavailable) was silently counted as a voice; and the cross-platform "works everywhere" claim is a correlated blind spot a single-platform board cannot see.

### Fixed
- **doc-vs-code residuals:** PRIVACY.md scrub claim softened (`secrets.mjs` is dev-only, not shipped) + config path corrected to `.claude/.coalboard.json`; `commands/coalboard.md` "sandboxed" → "staged + contract-isolated"; factory rigor comments aligned to `rigor.mjs` (no phantom "failed verify" trigger; relaxed = `active:false`).
- **conductor read project config via raw `process.cwd()`** → now walks UP from cwd to the nearest `.claude/.coalboard.json` (Phoenix #10 — a hook cwd may be a subdir; per-project config no longer silently ignored).
- **`diversifyModels` no longer names "Fable 5"** (proven access-gated / unavailable) — spread across spawnable generations only; example + CHANGELOG softened.
- **SECURITY SkillSpector framing** → re-scan is event-driven on a NEW SkillSpector version (the static rules are stable), not a per-CoalBoard-release "pending".

### Changed (safety + sharpness)
- **Dead-lens detection:** a lens that returns EMPTY / 0-tokens / "Completed in ~0s" is a FAILURE, not an empty vote (COMPLETED ≠ ANSWERED) — re-route, never silently count it (a phantom lens skews consensus + decorrelation).
- **Consent — per-instance override is ephemeral** (never written to config) + a **2nd cost-gate**: recompute the token estimate for the FINAL (post-override) config and re-confirm BEFORE spawning the first worker (an override to nasa multiplies the cost).
- **Cross-platform honesty:** cross-agent BY DESIGN, VERIFIED on Claude Code only; never state "works on X" unverified. Auditing CoalBoard itself, that is an unverified self-claim sub1/sub3 must challenge (single-platform blind spot; the human on another platform is the out-of-frame check).
- **Audit lens-angle:** sub1 follows the work's OWN links/citations + reads facts from the TARGET files, never from loaded MEMORY.
- **Audit-independence + report:** run a self-audit from a neutral context; write the report to a PERMANENT path (not the transient install clone) with a TIMESTAMPED unique filename (no same-day collision).

Deferred: sub4 per-rigor doc table · objective heading-order check · language re-flag · CONTRIBUTING emoji-strip.

## [1.0.4] — 2026-06-20

Round-3 self-audit (nasa, whole repo) — the board again caught a bug its green gate + 20 tests missed (the non-English nudge false-firing on emoji) and REFUTED its own "Fable 5 is fictional" lens by ground truth (the re-route failure proved the model is real but access-gated — known ≠ usable; data + feeling shared a training-cutoff blind spot — the Knight-Leveson case the README itself describes).

### Fixed
- **conductor `hasNonLatin` false-fired on emoji** (and any supplementary / symbol char) → the "non-English" nudge fired on plain English. Rewritten to flag only a non-LATIN LETTER (Unicode property escapes; strips Latin + every non-letter incl emoji + C0). Regression test added.
- **`updateDue` reported "due" every session when `~/.claude` was absent** — the stamp write failed silently. Now `mkdirSync` first.
- **`lenses: []` passed the schema → empty board.** A value-constrained `strArr` (lenses) must now be non-empty. Test added.
- **docs vs code (SECURITY.md / README):** "verify is sandboxed" → **contract-isolated, NOT OS-sandboxed**; "secrets scrubbed (`secrets.mjs`)" clarified — `secrets.mjs` is a DEV reference file, not shipped runtime; both guarantees labeled contract-enforced, not OS-enforced.
- **`excludePaths` documented as RESERVED** — it feeds only the optional PreToolUse backstop, which the default `hooks.json` does not wire.
- **`verify.mjs` now cross-checks** that the `plugin.json` version has a matching CHANGELOG entry (a doc-transition gate).

### Changed
- **Worker spawn-failure is now CLASSIFIED:** a GONE / unavailable model → re-route immediately; a rate-limit / quota → wait for the reset then retry (bounded), else re-route — never let a lens silently die, never re-pick a known-unavailable model (the Fable-5 lesson). diversifyModels falls back to an available generation.
- **Cross-key safety rule:** `applyConsent:false` under `coalboardMode:auto` (no human gate) is refused; `rigor:relaxed` wins over auto for auto-engagement.
- **Step 4 wording:** run reviewed checks from the staging / temp dir; the fail-escape climbs ONCE.
- factory config comment clarity (`excludePaths` scope; `criticalImports` AND-in-the-backstop vs OR-in-a-prompt).

Honest: SkillSpector re-scan still pending (v1.0.1 baseline). 4 README claims (a model name, two links, the install syntax, the org-landing version) flagged unverified — need a live fetch.

## [1.0.3] — 2026-06-19

Round-2 self-audit (the board on its own repo) + the queued dogfood points. The board surfaced a real **HIGH** bug its own green gate + 19 tests missed — three lenses disagreed on the direction, the judge RAN it to adjudicate (and refuted a lens that mis-claimed the opposite).

### Fixed
- **conductor `hasNonLatin` false-fired on C0 control chars** — `\n`/`\t`/`\r` sit below the excluded U+0020, so a multi-line ENGLISH prompt wrongly received the "non-English" nudge (eroding the signal for genuinely non-English critical tasks). Now strips C0 controls before the test (a code-point filter — no control-char literal, no NUL byte). Regression test added.
- **CONTRIBUTING** listed a removed `eval/` dir → now points at the org benchmarks (clean-clone).
- **SECURITY** told users the `node --test <glob>` form the repo's own AGENTS.md records as broken on Node 24 → `node scripts/test.mjs` (the canonical runner).
- **CI** (`ci.yml` / `codeql.yml`) blanket-ignored `**.md`, so a change to the shipped `SKILL.md` skipped CI and its `plugin/` dist-sync check → whitelist only the NON-shipped root docs.
- **config-schema** `lenses` had no value constraint → a typo'd lens name passed verify and reached runtime; now enum-checked (`data`/`truth`/`feeling`) via a value-constrained `strArr`.
- **factory config comment** overstated `relaxed` ("board off") and "locks nothing" → clarified (`coalboardMode:"off"` silences the conductor; `active`/`allDomainGates` are preset-semantic, not config keys).

### Changed
- **Convene consent now offers a per-run OVERRIDE via the question-box** — the `rigor` master dial (+ Audit scope) — tune a run without editing a config file; fine keys stay in `.coalboard.json`.
- **CC cost bonus is now the DEFAULT, not a maybe** — `lensTiers` unset → cheap lenses (haiku) + premium judge (opus), not all-mid (sonnet).
- **Audit scope = "every file, any extension"** — enumerate the actual files, not a fragile type list that silently misses `LICENSE` / dotfiles.
- **Each lens keeps its OWN angle in Audit** — sub1 grounds claims in LIVE sources (not just reading files); never flatten the lenses to a generic "audit every surface".
- **sub3 (feeling) is OPEN-ENDED** — the example feelings are SEEDS, not a closed menu; surface ANY feeling (incl OVERKILL / YAGNI), then make it concrete (uncertainty generates candidates; routing + verify resolve them).
- **README** clarifies the manual command is `/coalboard:coalboard` (plugin-namespaced) or the "convene the board" chat phrase — bare `/coalboard` is not a registered slash command.

## [1.0.2] — 2026-06-19

Self-audit (the board at nasa rigor, deepest scope) + the user's dogfood findings — all fixed and gated. The board found real bugs in its own repo (dogfood working); the judge caught one lens fabricating a finding (suspect-input-verified).

### Fixed
- **`rigor` preset is no longer silently neutered by the factory template** — the shipped `platform-configs/.coalboard.json` now leaves the rigor-controlled keys COMMENTED OUT, so copying it and setting `rigor:nasa` actually enables the levers (it previously forced them all back to standard — a user believed they had max paranoia on a crypto migration while running standard). Regression test added.
- **Secret scrubber** now catches the JSON `"key": "value"` form (the dominant diff/config format) and a multi-word unquoted passphrase (it leaked after word 1); `hasSecret` no longer reports a JSON secret as clean. Tests added.
- **`verify.mjs`** walks the whole `plugin/` tree (both-direction / dist-orphan check, per `scripts-quality.md §1`) — a new shipped file can no longer ship unverified.
- **README** version drift corrected to match the manifest.

### Changed
- **sub3 (`feeling`) is now a FULL-SPECTRUM skeptic** — every form of gut-feeling, not only correctness demands: design/taste intuition too (OVERKILL / over-engineered / redundant / too-clever / YAGNI / smells-wrong), each routed to a verifier; an unprovable feeling is a flagged gap, never dropped.
- **Audit mode is general** (not fit to one repo layout) — internal-consistency / live-findings / showcase-completeness checks are conditional on the project HAVING those surfaces; no assumption of sibling repos or a specific platform.
- **Language** directive moved up-front and made explicit for EVERY user-facing surface (the consent box, the running narration, the synthesis) — not a footnote.
- **same-target** marked INTERNAL board mechanics — never surfaced to the user as a choosable option; the user picks BREADTH (which files / how deep), never how the lenses divide.
- A deepest / "Everything" audit scope now covers all file types (docs / config / prose) with the same rigor as code.
- `SECURITY.md` SkillSpector provenance clarified (self-reported version, pinned by commit).

## [1.0.1] — 2026-06-19

### Added
- **Audit mode — repo/release readiness.** Auditing a repo or a release (not just a diff) now also checks **cross-sibling parity** (CI workflows · security toggles like secret-scanning/push-protection/Dependabot · hygiene files), **live findings** (open code-scanning / Dependabot / Scorecard / secret-scanning alerts — triage each, never leave one silently open; query them, don't assume), and **showcase completeness** (the org landing / README / benchmarks index). Plus a **scope-honesty rule**: "NO ERROR FOUND" states *what* was audited — an un-audited dimension is "not checked", never "clean". Closes a real blind spot: a skill can be correct while its repo/org is not.

## [1.0.0] — 2026-06-19

First **stable** release — the board's contract, config, and honest frame are settled, and it is benchmarked on two platforms.

### Added
- **Max-sharpness levers** (rigor-gated; bounded-cost preserved): `adversaryLens` (a red-team falsification lens), `tier2Verify` (property / fuzz / differential / metamorphic / mutation ground-truth gates) with `fuzzTimeboxSeconds`, `formalCommand` (optional TLA+/Alloy/SPARK), `contestedRound` (one surgical contested-point cross-exam on deadlock), and `diversifyModels` (spread lenses across model generations). The `rigor` preset tiers them (standard off · high/nasa on). Plus always-on judge discipline: calibrated lens output, a domain failure-taxonomy checklist, a disconfirmation + pre-mortem judge, a completeness critic, and honest-ceiling routing.
- **Factory config** (`platform-configs/.coalboard.json`): a fully-commented template for every key; `verify.mjs` validates it against the schema.
- **Benchmark** (`eval/`): with-the-board vs without on both Claude Code (reliability) and Antigravity (cross-vendor), with an honest method + per-task scoring.
- **SkillSpector scan** recorded in `SECURITY.md` (every finding verified false-positive).

### Changed
- **Scope reframed** — a general diverse-lens consensus board: the error-not-allowed slice is the primary **auto-trigger** (cost-disciplined, ~90% asleep); a **manual `/coalboard`** convenes on any hard problem worth several diverse perspectives.
- **No-zombie hardening** — each lens is collected then explicitly released; a returned-but-still-running worker is a zombie and is stopped, and the judge confirms none is alive before proceeding (a worker legitimately awaiting a permission is not reaped).
- Dropped the "governance layer" self-label.

## [0.1.0-beta.1] — 2026-06-19

First public **beta** of the consensus & debate board.

### Added
- **The board** (`skills/coalboard/SKILL.md`): on an error-not-allowed task, with consent, convene three parallel blind epistemic lenses (empirical/source-grounded, formal, show-me skeptic) → a judge that synthesizes on VERIFIED inputs → an independent out-of-frame solver that breaks deadlocks blind → staging → human sign-off. Generate and Audit modes.
- **Phoenix-13 conductor** (`hooks/coalboard-conductor.js`): SessionStart contract + a UserPromptSubmit AND-gate Layer-1 static scan that injects a halt-and-consent directive on a critical signal; self-update scheduling (kind-1). Fail-silent, zero-dependency, no network, no spawn.
- **Config** (`scripts/lib/config-schema.mjs`): a 24-key source-of-truth with a `rigor` preset dial (`relaxed|standard|high|nasa`), validators, and series-standard self-update keys.
- **Core libs**: `trigger.mjs` (AND-gate detection), `rigor.mjs` (preset → bundle), `secrets.mjs` (credential scrubber).
- **Commands**: `/coalboard` (manual convene) and `/coalboard:update` (self-update).
- **Build + gate**: `build-plugin.mjs` (clean `plugin/` dist), `verify.mjs`, and 13 tests (6 hermetic conductor + 7 lib unit).

### Honest frame
- Guarantees **bounded cost** + **zero-breakage**; improves correctness without claiming a defect/reliability number. NASA-inspired in structure, not in numbers (`0.01/KLOC` and `10⁻⁹` are dropped — unverifiable by any LLM). Model-resilient: it scales with the underlying model.

### Known (pre-1.0)
- No independent SkillSpector scan yet (structural assurance only — see `SECURITY.md`). Cross-platform parallel support is verified as of 2026-06 but churns; re-verify per platform.
