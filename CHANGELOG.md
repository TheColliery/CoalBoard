# Changelog

All notable changes to CoalBoard are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer (the canonical version lives in `.claude-plugin/plugin.json`).

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
