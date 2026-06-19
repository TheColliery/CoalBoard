# Changelog

All notable changes to CoalBoard are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer (the canonical version lives in `.claude-plugin/plugin.json`).

## [1.0.4] — 2026-06-20

Round-3 self-audit (nasa, whole repo) — the board again caught a bug its green gate + 20 tests missed (the non-English nudge false-firing on emoji) and REFUTED its own "Fable 5 is fictional" lens by ground truth (the re-route failure proved the model exists; data + feeling shared a training-cutoff blind spot — the Knight-Leveson case the README itself describes).

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
