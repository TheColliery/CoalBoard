<div align="center">

# ⚖️ CoalBoard

> *A coal board governs operations and resolves disputes for the mines — this one is the board for the work where a single mistake is catastrophic.*

**A diverse-lens consensus & debate board for error-not-allowed work** — on a critical task, with your consent, blind epistemic lenses debate in parallel, a judge synthesizes on verified inputs, and you sign off before anything touches your files.

![version](https://img.shields.io/github/v/tag/TheColliery/CoalBoard?label=version&color=blue)
![license](https://img.shields.io/badge/license-MIT-blue)
![status](https://img.shields.io/badge/status-stable-brightgreen)
![Claude Code](https://img.shields.io/badge/Claude_Code-validated-success)
![Antigravity](https://img.shields.io/badge/Antigravity-validated-success)

[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Privacy](PRIVACY.md) · [Releases](https://github.com/TheColliery/CoalBoard/releases)

**Part of [TheColliery](https://github.com/TheColliery)** — siblings: **[CoalMine](https://github.com/HetCreep/CoalMine)** (quality canaries) · **[CoalTipple](https://github.com/TheColliery/CoalTipple)** (model/effort routing) · **[CoalHearth](https://github.com/TheColliery/CoalHearth)** (session warm-resume) · **[CoalFace](https://github.com/TheColliery/CoalFace)** (fan-out discipline).

</div>

---

## ⚖️ What it is

On an **error-not-allowed** task — security/crypto, a DB/financial migration, high-precision math/physics — and **only with your consent**, CoalBoard convenes a board:

- three **epistemic lenses** debate the task **in parallel, blind to each other** (so they don't anchor): an **empirical** lens that grounds claims in live, cross-referenced sources; a **formal** lens that reasons from logic and proof; and a **"show-me" skeptic** that turns every doubt into a concrete evidence-demand (*"show the date", "show it actually runs"*);
- a **judge** synthesizes — on **verified** inputs, never on which answer sounds best;
- on a deadlock, an **independent out-of-frame solver** re-derives the answer blind and breaks the tie by agreement;
- every proposed change is staged to `.coalboard/proposed/` (reports land in `.coalboard/reports/`) and **you sign off** before a single live file changes.

Its **auto-trigger** stays on the critical slice (off ~90%, cost-disciplined) — but you can **manually convene it** (say *"convene the board"* in chat, or run the `/coalboard:coalboard` plugin command) on any hard problem worth several diverse perspectives, in **any domain** — code, docs, math, research, translation, legal — not just code. Always behind a consent gate.

## 🛡️ What it guarantees (and what it doesn't)

CoalBoard is **NASA-inspired in structure** (redundancy + design-diversity + human-in-the-loop + trigger-only-on-critical) — **not in numbers.** It honestly guarantees two things:

1. **Bounded cost** — a solo agent thrashing on a hard bug is an unbounded token-bleed; the board converges (single-turn, judge-final, human-escape), so its cost is high but **predictable and capped**. Pay a known premium to cap the tail.
2. **Zero-breakage** — staging + propose-not-execute means the live workspace is never touched until verified *and* approved (a side-effect — a run migration, an API call — is gated behind your approval, never executed during the debate).

Both guarantees are **contract-enforced** — the board's staging discipline + your sign-off — **not** an OS sandbox; a skill cannot OS-enforce. The human gate is the load-bearing node.

It **improves** correctness; it does **not** claim a defect rate or a reliability figure (an LLM ensemble is probabilistic, not formally proven — and `10⁻⁹` is unverifiable by any system). It gets *more accurate as the underlying models improve*, for free — the structure is model-agnostic.

## 📊 Benchmark

**Headline (2026-07-03 redo, Opus 4.8):** solo **4/5** vs board **5/5** on 5 error-not-allowed tasks. On a STRONG solo model the reasoning traps (crypto timing-leak, compounding basis, async race, heading defects) are already caught unaided — the board's irreducible edge is the version-sensitive FACT (T3), where only RUN-the-check (a live fetch) beats training-stale memory (board committed the current LTS; solo hedged-then-shipped a stale one). The board = solo **+ ground-truth execution**; its margin narrows as the base model strengthens but never closes on facts that live outside the model. (The older ~13/20 solo run was a weaker solo model.)

Cross-vendor, the lift is larger on a weaker solo model (the older 2026-06-19 run). Full method, per-task scoring, and the honest-ceiling finding live in the series records: [`TheColliery/.github/benchmarks/CoalBoard`](https://github.com/TheColliery/.github/tree/main/benchmarks/CoalBoard).

> Honest scope: small, dated samples; the board **improves** correctness, it does not prove a defect rate. A board whose lenses share one model still shares that model's blind spot (the honest ceiling). The honest sell is **bounded cost + zero-breakage**, not a reliability number.

## 🚀 Install

**Claude Code** — one command (also enables hook auto-activation + the cheap-lenses / premium-judge cost discount, both CC-only):

```bash
claude plugin marketplace add TheColliery/CoalBoard
claude plugin install coalboard@coalboard
```

**Antigravity** — *validated end-to-end (2026-06-22)*. Antigravity has no plugin manager: a skill is installed by copying its folder into a customizations root, which Antigravity auto-discovers at session start (no install command, no manifest, no registration):

```powershell
git clone https://github.com/TheColliery/CoalBoard.git --depth 1
# global (all workspaces):
Copy-Item -Recurse CoalBoard/skills/coalboard "$env:USERPROFILE\.gemini\config\skills\coalboard"
# — or per-project: copy into <your-repo>\.agents\skills\coalboard instead
Remove-Item -Recurse -Force CoalBoard   # optional cleanup
```

Start a new Antigravity session; `coalboard` appears in the skills list. The board's AG tool-mapping (read-only-leaf lenses via `define_subagent`, mandatory `kill_all` reap) is in [`references/platform-antigravity.md`](skills/coalboard/references/platform-antigravity.md). The conductor hook + cost-tiering stay CC-only (Antigravity has no hooks and no per-worker model-pick — the lenses run the parent model).

**Other concurrent-subagent platforms** (Cursor, Codex, Copilot, Amp, Goose, … — *design-supported, unverified*) — the board is a plain skill: point your agent at [`skills/coalboard/SKILL.md`](skills/coalboard/SKILL.md) (the contract is platform-neutral; it convenes via your platform's native subagent tool). There is no one-command installer, and the conductor hook + cost-tiering are CC-only. **The DEBATE structure is cross-agent by design; it is VERIFIED on Claude Code and Antigravity** — every other named platform is supported-not-yet-proven, so re-verify subagent support on yours.

## ⚙️ Configure

Everything is tunable in `.coalboard.json` (global `~/.claude/` overlaid by project `.claude/`). The headline dial is **`rigor`** — `relaxed | standard | high | nasa` — a preset that sets the board's strictness; any individual key overrides it. (`nasa` = maximum paranoia: trust nothing, the human signs off — *not* a `10⁻⁹` claim.) Key groups: activation (`coalboardMode`, `criticalPaths`, `triggerConfidence`), the board (`lenses`, `consensusThreshold`, `maxRounds`), verify (`qaStrictness`, `sastCommand`, `applyConsent`), and self-update. See [the skill contract](skills/coalboard/SKILL.md) for the full set. A fully-commented template ships at [`platform-configs/.coalboard.json`](platform-configs/.coalboard.json) — copy it to `~/.claude/.coalboard.json` (or your project's `.claude/.coalboard.json`) and edit.

## 🧭 Part of TheColliery

CoalBoard is the **consensus & debate board** of the mining series, alongside [CoalMine](https://github.com/HetCreep/CoalMine) (quality canaries), [CoalTipple](https://github.com/TheColliery/CoalTipple) (model/effort routing), [CoalHearth](https://github.com/TheColliery/CoalHearth) (session warm-resume), and [CoalFace](https://github.com/TheColliery/CoalFace) (fan-out discipline). Install one and it stands alone; install all and they compose without conflict. Shared doctrine: Phoenix-13 hooks (zero-dependency, no network, fail-silent, no child processes, deterministic), single-source-of-truth config schemas, and a strict no-overkill discipline. Series doctrine: [`TheColliery/.github`](https://github.com/TheColliery/.github).

Zero-dependency, offline, no API keys.

---

## 📄 License

MIT License. See [LICENSE](LICENSE).
