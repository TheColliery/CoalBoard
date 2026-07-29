<div align="center">

# ⚖️ CoalBoard

> *A coal board governs operations and resolves disputes for the mines — this one is the board for the work where a single mistake is catastrophic.*

**A diverse-lens consensus & debate board for error-not-allowed work** — on a critical task, with your consent, blind epistemic lenses debate in parallel, a judge synthesizes on verified inputs, and you sign off before anything touches your files.

![version](https://img.shields.io/github/v/tag/TheColliery/CoalBoard?label=version&color=blue)
![license](https://img.shields.io/badge/license-Apache_2.0-blue)
![status](https://img.shields.io/badge/status-stable-brightgreen)

![Claude Code](https://img.shields.io/badge/Claude_Code-validated-brightgreen)
![Antigravity](https://img.shields.io/badge/Antigravity-validated-brightgreen)
![Cursor](https://img.shields.io/badge/Cursor-design--supported-blue)
![Codex](https://img.shields.io/badge/Codex-design--supported-blue)
![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-design--supported-blue)
![Cline](https://img.shields.io/badge/Cline-design--supported-blue)
![Copilot](https://img.shields.io/badge/Copilot-design--supported-blue)

[Benchmark](https://github.com/TheColliery/.github/tree/main/benchmarks/CoalBoard) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Privacy](PRIVACY.md) · [Releases](https://github.com/TheColliery/CoalBoard/releases)

**Part of [TheColliery](https://github.com/TheColliery)** — siblings: **[CoalMine](https://github.com/HetCreep/CoalMine)** (quality canaries) · **[CoalTipple](https://github.com/TheColliery/CoalTipple)** (model/effort routing) · **[CoalHearth](https://github.com/TheColliery/CoalHearth)** (session warm-resume) · **[CoalFace](https://github.com/TheColliery/CoalFace)** (fan-out discipline) · **[CoalWash](https://github.com/TheColliery/CoalWash)** (memory defrag) · **[CoalLedger](https://github.com/TheColliery/CoalLedger)** (docs health).

</div>

---

## ⚖️ What it is

On an **error-not-allowed** task — security/crypto, a DB/financial migration, high-precision math/physics — and **only with your consent**, CoalBoard convenes a board of diverse epistemic lenses to debate the task, a judge to synthesize on verified inputs, and you to sign off before anything touches your files.

Three doors in — every one behind your consent:

- **Auto** — the error-not-allowed slice above. Cost-disciplined: asleep ~90% of the time.
- **Manual** — say *"convene the board"* in chat, or invoke the `/coalboard` skill (plugin-qualified as `coalboard:coalboard`), on any hard problem worth several diverse perspectives, in **any domain** — code, docs, math, research, translation, legal. Two modes: **generate** new work, or **audit / review** existing work.
- **Opinion ("ask CB")** — when your agent is about to ask you to settle a decision it can't settle itself, that same question gains a third option, *ask CB*, its cost on the label (~4 lenses + a judge). **Your pick is the consent** — per-instance, never auto-convened, nothing persisted. The board returns an **opinion** re-asked into your original question: you still decide, and no file changes.

## 🔍 How it works

| Lens | Grounds in |
|---|---|
| **Empirical** | Live, cross-referenced sources — never training memory |
| **Formal** | Logic and proof — internal consistency |
| **Show-me** | Turns every doubt into a concrete evidence-demand (*"show the date", "show it actually runs"*) |

1. **Convene** — the active lenses debate the same target **in parallel, blind to each other** (so they don't anchor on one another's answer).
2. **Judge** — synthesizes on **verified** inputs, never on which answer sounds best.
3. **Tiebreak** (on deadlock) — an **independent out-of-frame solver** re-derives the answer blind and breaks the tie by agreement.
4. **Stage → consent → apply** — every proposed change is staged to `.coalboard/proposed/` (reports land in `.coalboard/reports/`) and **you sign off** before a single live file changes.

**The opinion lane seats a different board.** Four equal-knowledge seats — one equal tier, never Fable — differ only in a locked perspective: **realtime** (trusts only what it can measure, run, or fetch this session; anything out of reach is declared *ran blind*, never filled from memory), **reality** (show-me — undemonstrated = not yet real; builds breaking cases both ways), **feeling** (walks the human experience under each option; never runs anything), **outdim** (receives the bare problem only — no options, no proposal, no house context — and designs its own answer from scratch). If you brought a leaning, every seat that sees it tries to **refute** it — never grade it (a refutation that fails is the strongest support a proposal can earn); outdim never sees it at all. The judge synthesizes — never counts votes — and **re-asks your original question** with the board's view attached: you decide, and nothing is staged or applied.

CoalBoard is **NASA-inspired in structure** (redundancy + design-diversity + human-in-the-loop + trigger-only-on-critical) — **not in numbers.** It honestly guarantees two things:

1. **Bounded cost** — a solo agent thrashing on a hard bug is an unbounded token-bleed; the board converges (single-turn, judge-final, human-escape), so its cost is high but **predictable and capped**. Pay a known premium to cap the tail.
2. **Zero-breakage** — staging + propose-not-execute means the live workspace is never touched until verified *and* approved (a side-effect — a run migration, an API call — is gated behind your approval, never executed during the debate). This is a **files** guarantee: the verify step itself runs checks, so an executed side-effect can only be *prevented* (pre-run lint + propose-not-execute), never undone.

Both guarantees are **contract-enforced** — the board's staging discipline + your sign-off — **not** an OS sandbox; a skill cannot OS-enforce. The human gate is the load-bearing node.

It **improves** correctness; it does **not** claim a defect rate or a reliability figure (an LLM ensemble is probabilistic, not formally proven — and `10⁻⁹` is unverifiable by any system). It gets *more accurate as the underlying models improve*, for free — the structure is model-agnostic.

## 🤖 Compatibility

**Validated end-to-end: Claude Code + Antigravity** (Antigravity: 2026-06-22, a self-run validation — not third-party-audited). Claude Code additionally auto-activates via hooks and gets the cheap-lenses / premium-judge cost discount — both Claude-Code-only bonuses.

Every other concurrent-subagent platform (Cursor, Codex, Gemini CLI, Cline, Copilot, Amp, Goose, …) is **design-supported, unverified** — the board is a plain, platform-neutral skill ([`skills/coalboard/SKILL.md`](skills/coalboard/SKILL.md)) that convenes via your platform's own native subagent tool, so it should run there, but re-verify subagent support before trusting it. See Install below for the exact steps per platform.

## 🚀 Install

**Claude Code** — one command (also enables hook auto-activation + the cheap-lenses / premium-judge cost discount, both CC-only):

```bash
claude plugin marketplace add TheColliery/CoalBoard
claude plugin install coalboard@coalboard
```

**Antigravity** — *validated end-to-end (2026-06-22), self-run — not third-party-audited*. Antigravity has no plugin manager: a skill is installed by copying its folder into a customizations root, which Antigravity auto-discovers at session start (no install command, no manifest, no registration):

```powershell
git clone https://github.com/TheColliery/CoalBoard.git --depth 1
# global (all workspaces):
Copy-Item -Recurse CoalBoard/skills/coalboard "$env:USERPROFILE\.gemini\config\skills\coalboard"
# — or per-project: copy into <your-repo>\.agents\skills\coalboard instead
Remove-Item -Recurse -Force CoalBoard   # optional cleanup
```

Start a new Antigravity session; `coalboard` appears in the skills list. The board's AG tool-mapping (read-only-leaf lenses via `define_subagent`, mandatory `kill_all` reap) is in [`references/platform-antigravity.md`](skills/coalboard/references/platform-antigravity.md). The conductor hook + cost-tiering stay CC-only (CoalBoard ships no Antigravity hook wire, and Antigravity has no per-worker model-pick — the lenses run the parent model).

**Other concurrent-subagent platforms** (Cursor, Codex, Gemini CLI, Cline, Copilot, Amp, Goose, … — *design-supported, unverified*) — the board is a plain skill: point your agent at [`skills/coalboard/SKILL.md`](skills/coalboard/SKILL.md) (the contract is platform-neutral; it convenes via your platform's native subagent tool). Gemini CLI's parallel subagents are now first-party official (`/agents`) — business Standard/Enterprise plans only (individual tiers lost access 2026-06-18). There is no one-command installer, and the conductor hook + cost-tiering are CC-only. **The DEBATE structure is cross-agent by design; it is VALIDATED on Claude Code and Antigravity** — every other named platform is design-supported only (capability documented first-party, nothing run), so re-verify subagent support on yours.

## Commands

| Command | What it does |
|---|---|
| `/coalboard` | Convene the board manually on any hard problem worth several diverse perspectives. An interactive setup offers the picks and shows the bill before anything spawns. Two modes: **generate** new work, or **audit / review** existing work. |
| `/coalboard:stats` | Session report — boards convened, which lenses ran and at what model tier, verdicts, staged vs applied. Read-only; it modifies no file. |
| `/coalboard:update` | Check for a newer CoalBoard version and offer to apply it, or set how updates are handled (`updateMode`). It offers — it never applies by itself. |

Slash commands are the Claude Code form. On any other agent the board is invoked the way your agent invokes a skill — by name (`coalboard`), or by just saying *"convene the board"*. The other two doors in — the auto-trigger and the **"ask CB"** opinion option — are not typed at all; see **What it is** above.

## ⚙️ Configure

Everything is tunable in `.coalboard.json` — a global `~/.claude/.coalboard.json` overlaid per key by the nearest project `.claude/.coalboard.json` (project wins), so you can **tune or shut off a globally-installed skill per project** (off-switch: `coalboardMode: off`) — a skill you don't need in a given project stops loading (and burning tokens) there. The headline dial is **`rigor`** — `relaxed | standard | high | nasa` — a preset that sets the board's strictness; any individual key overrides it. (`nasa` = maximum paranoia: trust nothing, the human signs off — *not* a `10⁻⁹` claim.) The high-impact keys:

| Key | Default | What it does |
|---|---|---|
| `rigor` | `standard` | Strictness preset (`relaxed` \| `standard` \| `high` \| `nasa`) — sets defaults for the knobs below; any explicit key overrides it |
| `coalboardMode` | `ask` | Convene behavior on a detected critical task: `ask` (per-instance consent + cost estimate) \| `auto` (convene without asking) \| `off` (never convene, never offer "ask CB" — the board's master switch) |
| `triggerConfidence` | `90` | Semantic-classifier confidence (0-100) a task must clear to count as critical — higher = fewer false triggers, more false-negatives (the manual `/coalboard` is the safety valve) |
| `lenses` | `data, truth, feeling` | The active epistemic lenses (each `data` \| `truth` \| `feeling`) — the decorrelation mechanism; all three are the floor for error-not-allowed work |
| `fableConsent` | `ask` | Consent to seat **Fable 5** (the top lens rung — within the weekly Fable cap on Max/Team-Premium, real metered credit on lower plans) at `high`/`nasa`: `ask` (a consent box before the fable seats, showing the exact count + a ~est cost) \| `always` (seat without asking) \| `never` (always fall to the highest non-fable tier). `relaxed`/`standard` never seat fable |
| `consensusThreshold` | `80` | Worker-agreement % below which the board is deadlocked and summons the out-of-frame sub4 observer to break the tie |
| `maxRounds` | `1` | Debate rounds — `1` = single-turn (max independence); `>1` = multi-round cross-examination (reintroduces anchoring) |

Full key reference: every key + default lives in [`scripts/lib/config-schema.mjs`](scripts/lib/config-schema.mjs) and the commented template [`platform-configs/.coalboard.json`](platform-configs/.coalboard.json).

## Permissions

CoalBoard reads the target and writes to its own scratch — staged fixes in `.coalboard/proposed/`, reports in `.coalboard/reports/`, a worker's private resume checkpoint in `.coalboard/memory/` — and to exactly one place outside it: if you answer "always, this project" at the Fable money gate, it persists that single key (`fableConsent: "always"`) into your project `.claude/.coalboard.json` and writes nothing else into any config. Nothing touches a live file until you approve it. On the main board two lens seats carry a capability spike beyond read: **show-me**, and (when active) **adversary**, may run commands to prove a claim; **empirical** alone reaches the network, and no other seat gets either — a CONTRACT every seat follows, not a platform guarantee (only the absence of write/spawn tools is platform-enforced). In the opinion lane two seats may run — **realtime** (measures what is; the lane's only network reach) and **reality** (runs the breaking case it built, to demonstrate); **feeling** and **outdim** never run or fetch (outdim's blindness bars even reading the workspace), and the lane writes no file — no staged fix, no report; its resume scratch, if armed, is deleted at the end. Workers never spawn and never ask; only main picks each seat's model (including any Fable seat, gated by `fableConsent`), verifies ground-truth, and applies to live — on your consent.

Full series matrix + the must-fail set: [Permission Matrix](https://github.com/TheColliery/.github/blob/main/PERMISSION-MATRIX.md)

## 📊 Benchmark

**Headline (2026-07-03 redo, Opus 4.8):** solo **4/5** vs board **5/5** on 5 error-not-allowed tasks. On a STRONG solo model the reasoning traps (crypto timing-leak, compounding basis, async race, heading defects) are already caught unaided — the board's irreducible edge is the version-sensitive FACT (T3), where only RUN-the-check (a live fetch) beats training-stale memory (board committed the current LTS; solo hedged-then-shipped a stale one). The board = solo **+ ground-truth execution**; its margin narrows as the base model strengthens but never closes on facts that live outside the model. (The older ~13/20 solo run was a weaker solo model.)

**Cross-vendor (same 2026-07-03 redo, Antigravity / Gemini 3.5 Flash):** solo **~4/15 (27%)** vs board **5/5** — a weak solo model misses reasoning traps too, so the board recovers all of them; the weaker the solo model, the larger the board's lift. (Supersedes the older 2026-06-19 AG run's smaller solo 1/5 → board 4/5 gap.) Full method, per-task scoring, and the honest-ceiling finding live in the series records: [`TheColliery/.github/benchmarks/CoalBoard`](https://github.com/TheColliery/.github/tree/main/benchmarks/CoalBoard).

> Honest scope: small, dated samples; the board **improves** correctness, it does not prove a defect rate. A board whose lenses share one model still shares that model's blind spot (the honest ceiling). The honest sell is **bounded cost + zero-breakage**, not a reliability number.

## 🧭 Part of TheColliery

CoalBoard is the **consensus & debate board** of the mining series, alongside its six siblings:

- [CoalMine](https://github.com/HetCreep/CoalMine) — quality canaries
- [CoalTipple](https://github.com/TheColliery/CoalTipple) — model/effort routing
- [CoalHearth](https://github.com/TheColliery/CoalHearth) — session warm-resume
- [CoalFace](https://github.com/TheColliery/CoalFace) — fan-out discipline
- [CoalWash](https://github.com/TheColliery/CoalWash) — memory defrag
- [CoalLedger](https://github.com/TheColliery/CoalLedger) — docs health

Install one, it stands alone; install all, they compose without conflict.

Shared doctrine: Phoenix-13 hooks (zero-dependency, no network, fail-silent, no child processes, deterministic), single-source-of-truth config schemas, and a strict no-overkill discipline. Series doctrine: [`TheColliery/.github`](https://github.com/TheColliery/.github).

Zero-dependency, offline, no API keys.

---

## 📄 License

Apache License 2.0. See [LICENSE](LICENSE).
