# CoalBoard

> A *coal board* governs operations and resolves disputes for the mines. This one is the **consensus & debate board** of [TheColliery](https://github.com/TheColliery) — for the work where a single mistake is catastrophic.

**Status: `v1.0.6` — stable.** Functional, tested, and benchmarked (see [Benchmark](#benchmark)).

## What it is

On an **error-not-allowed** task — security/crypto, a DB/financial migration, high-precision math/physics — and **only with your consent**, CoalBoard convenes a board:

- three **epistemic lenses** debate the task **in parallel, blind to each other** (so they don't anchor): an **empirical** lens that grounds claims in live, cross-referenced sources; a **formal** lens that reasons from logic and proof; and a **"show-me" skeptic** that turns every doubt into a concrete evidence-demand (*"show the date", "show it actually runs"*);
- a **judge** synthesizes — on **verified** inputs, never on which answer sounds best;
- on a deadlock, an **independent out-of-frame solver** re-derives the answer blind and breaks the tie by agreement;
- every proposed change is staged to `.coalboard/proposed/` (reports land in `.coalboard/reports/`) and **you sign off** before a single live file changes.

Its **auto-trigger** stays on the critical slice (off ~90%, cost-disciplined) — but you can **manually convene it** (say *"convene the board"* in chat, or run the `/coalboard:coalboard` plugin command) on any hard problem worth several diverse perspectives, in **any domain** — code, docs, math, research, translation, legal — not just code. Always behind a consent gate.

## What it guarantees (and what it doesn't)

CoalBoard is **NASA-inspired in structure** (redundancy + design-diversity + human-in-the-loop + trigger-only-on-critical) — **not in numbers.** It honestly guarantees two things:

1. **Bounded cost** — a solo agent thrashing on a hard bug is an unbounded token-bleed; the board converges (single-turn, judge-final, human-escape), so its cost is high but **predictable and capped**. Pay a known premium to cap the tail.
2. **Zero-breakage** — staging + propose-not-execute means the live workspace is never touched until verified *and* approved (a side-effect — a run migration, an API call — is gated behind your approval, never executed during the debate).

Both guarantees are **contract-enforced** — the board's staging discipline + your sign-off — **not** an OS sandbox; a skill cannot OS-enforce. The human gate is the load-bearing node.

It **improves** correctness; it does **not** claim a defect rate or a reliability figure (an LLM ensemble is probabilistic, not formally proven — and `10⁻⁹` is unverifiable by any system). It gets *more accurate as the underlying models improve*, for free — the structure is model-agnostic.

## Benchmark

With the board vs without, on a fixed set of **error-not-allowed** tasks (each a known gold + a subtle trap a single pass ships), measured 2026-06-19 — full method + per-task scoring in the series records, [`TheColliery/.github/benchmarks/CoalBoard`](https://github.com/TheColliery/.github/tree/main/benchmarks/CoalBoard):

- **Reliability (Claude Code, Opus-class), repeated runs:** board **10/10** consistent vs an un-primed solo **~13/20 (~65%)**. A strong solo knows the textbook traps but is inconsistent where rigor must be forced — it shipped a wrong-cent figure, hedged a fetched date, missed a duplicate heading. The board makes the rigor automatic.
- **Cross-vendor (Antigravity, Gemini 3.1 Pro Low):** solo **1/5 → board 4/5** — the board fixed the three *dangerous* errors a casual pass shipped (a timing side-channel, a stale version, a race condition). The lift is **larger on a weaker model**, and the discipline is **not Claude-specific**.
- **The honest ceiling, shown:** the all-Gemini board still missed one defect — its lenses share a model, so they share the blind spot (Knight–Leveson); a different-model board (Claude) caught it. The board *improves* correctness; it does not escape a blind spot every copy shares. Hence the honest sell — **bounded cost + zero-breakage**, not a reliability number.

> Honest scope: small, dated samples; a board improves correctness, it does not prove a defect rate.

## Install

**Claude Code** — one command (also enables hook auto-activation + the cheap-lenses / premium-judge cost discount, both CC-only):

```bash
claude plugin marketplace add TheColliery/CoalBoard
claude plugin install coalboard@coalboard
```

**Other platforms** (Cursor, Codex, Copilot, Amp, Goose, …) — the board is a plain skill: point your agent at [`skills/coalboard/SKILL.md`](skills/coalboard/SKILL.md) (the contract is platform-neutral; it convenes via your platform's native subagent tool). There is no one-command installer, and the conductor hook + cost-tiering are CC-only. **Cross-agent operation is by design but VERIFIED on Claude Code only** — treat other platforms as supported-not-yet-proven, and re-verify subagent support on yours.

## Configure

Everything is tunable in `.coalboard.json` (global `~/.claude/` overlaid by project `.claude/`). The headline dial is **`rigor`** — `relaxed | standard | high | nasa` — a preset that sets the board's strictness; any individual key overrides it. (`nasa` = maximum paranoia: trust nothing, the human signs off — *not* a `10⁻⁹` claim.) Key groups: activation (`coalboardMode`, `criticalPaths`, `triggerConfidence`), the board (`lenses`, `consensusThreshold`, `maxRounds`), verify (`qaStrictness`, `sastCommand`, `applyConsent`), and self-update. See the skill contract for the full set. A fully-commented template ships at [`platform-configs/.coalboard.json`](platform-configs/.coalboard.json) — copy it to `~/.claude/.coalboard.json` (or your project's `.claude/.coalboard.json`) and edit.

## Part of TheColliery

CoalBoard is the **consensus & debate board** of the mining series, alongside [CoalMine](https://github.com/HetCreep/CoalMine) (quality canaries) and [CoalTipple](https://github.com/TheColliery/CoalTipple) (model/effort routing). Install one and it stands alone; install all and they compose without conflict. Series doctrine: [`TheColliery/.github`](https://github.com/TheColliery/.github).

Zero-dependency, offline, no API keys.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Privacy](PRIVACY.md) · [Changelog](CHANGELOG.md)
