# CoalBoard

> A *coal board* governs operations and resolves disputes for the mines. This one is the **consensus & debate board** of [TheColliery](https://github.com/TheColliery) — for the work where a single mistake is catastrophic.

**Status: `v0.1.0-beta.1` — early/beta.** Functional and tested; the API and prompts may still move before `1.0`.

## What it is

On an **error-not-allowed** task — security/crypto, a DB/financial migration, high-precision math/physics — and **only with your consent**, CoalBoard convenes a board:

- three **epistemic lenses** debate the task **in parallel, blind to each other** (so they don't anchor): an **empirical** lens that grounds claims in live, cross-referenced sources; a **formal** lens that reasons from logic and proof; and a **"show-me" skeptic** that turns every doubt into a concrete evidence-demand (*"show the date", "show it actually runs"*);
- a **judge** synthesizes — on **verified** inputs, never on which answer sounds best;
- on a deadlock, an **independent out-of-frame solver** re-derives the answer blind and breaks the tie by agreement;
- everything is staged to `.coalboard/proposed/` and **you sign off** before a single live file changes.

Its **auto-trigger** stays on the critical slice (off ~90%, cost-disciplined) — but you can **manually convene it** (`/coalboard`) on any hard problem worth several diverse perspectives. Always behind a consent gate.

## What it guarantees (and what it doesn't)

CoalBoard is **NASA-inspired in structure** (redundancy + design-diversity + human-in-the-loop + trigger-only-on-critical) — **not in numbers.** It honestly guarantees two things:

1. **Bounded cost** — a solo agent thrashing on a hard bug is an unbounded token-bleed; the board converges (single-turn, judge-final, human-escape), so its cost is high but **predictable and capped**. Pay a known premium to cap the tail.
2. **Zero-breakage** — staging + propose-not-execute means the live workspace is never touched until verified *and* approved (a side-effect — a run migration, an API call — is gated behind your approval, never executed during the debate).

It **improves** correctness; it does **not** claim a defect rate or a reliability figure (an LLM ensemble is probabilistic, not formally proven — and `10⁻⁹` is unverifiable by any system). It gets *more accurate as the underlying models improve*, for free — the structure is model-agnostic.

## Install

```bash
claude plugin marketplace add TheColliery/CoalBoard
claude plugin install coalboard@coalboard
```

(Cross-agent: runs on any platform with concurrent subagents. **Claude Code** additionally lets it run cheap lenses + a premium judge for a cost discount, and auto-activates via hooks.)

## Configure

Everything is tunable in `.coalboard.json` (global `~/.claude/` overlaid by project `.claude/`). The headline dial is **`rigor`** — `relaxed | standard | high | nasa` — a preset that sets the board's strictness; any individual key overrides it. (`nasa` = maximum paranoia: trust nothing, the human signs off — *not* a `10⁻⁹` claim.) Key groups: activation (`coalboardMode`, `criticalPaths`, `triggerConfidence`), the board (`lenses`, `consensusThreshold`, `maxRounds`), verify (`qaStrictness`, `sastCommand`, `applyConsent`), and self-update. See the skill contract for the full set. A fully-commented template ships at [`platform-configs/.coalboard.json`](platform-configs/.coalboard.json) — copy it to `~/.claude/.coalboard.json` (or your project's `.claude/`) and edit.

## Part of TheColliery

CoalBoard is the **consensus & debate board** of the mining series, alongside [CoalMine](https://github.com/HetCreep/CoalMine) (quality canaries) and [CoalTipple](https://github.com/TheColliery/CoalTipple) (model/effort routing). Install one and it stands alone; install all and they compose without conflict. Series doctrine: [`TheColliery/.github`](https://github.com/TheColliery/.github).

Zero-dependency, offline, no API keys.
