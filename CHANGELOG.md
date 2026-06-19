# Changelog

All notable changes to CoalBoard are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer (the canonical version lives in `.claude-plugin/plugin.json`).

## [Unreleased]

### Added
- **Factory config** (`platform-configs/.coalboard.json`): a fully-commented template for every config key (copy to `~/.claude/.coalboard.json` to tune). `verify.mjs` now validates it against the schema.

### Changed
- **Scope reframed** — CoalBoard is a general diverse-lens consensus board: the error-not-allowed slice is the primary **auto-trigger** (still cost-disciplined, ~90% asleep), but a **manual `/coalboard`** convenes on any hard problem worth several diverse perspectives. Updated SKILL, command, README, and plugin/marketplace descriptions.
- Dropped the "governance layer" self-label in the README — it is a consensus & debate board.

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
