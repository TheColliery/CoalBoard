# CoalBoard on Antigravity (verified 2026-06-22)

> Loaded ON-DEMAND when running the board on Antigravity. The SKILL.md flow is UNCHANGED — this only maps the platform-agnostic contract to AG's tools + the verified caveats. Validated end-to-end on AG (Claude Opus 4.6) — a self-run validation, not third-party-audited: 3 read-only-leaf lenses → invoke parallel → judge → reap; decontamination clean.

## Tool mapping (Claude Code → Antigravity)
| step | Claude Code | Antigravity |
|---|---|---|
| spawn a lens | `Agent`/`Task` | `define_subagent(enable_write_tools=false, enable_subagent_tools=false)` → `invoke_subagent` ⚠️ 2026-08-15: unconfirmed against current docs (see caveat below) |
| read-only + leaf | TOOL-LEVEL via the `Explore` type (the removals SKILL.md Step 1 enumerates) | **TOOL-LEVEL** — the write/spawn tools are ABSENT from the sub ⚠️ 2026-08-15: unconfirmed against current docs (see caveat below) |
| per-seat run/fetch minimum (P19) | **NOT expressible** — `Explore` passes every other tool through, so the ledger is contract-only | `define_subagent` is called PER SEAT, so anything it can toggle is per-seat by construction — but only the write/spawn flags are VERIFIED. **A shell/fetch toggle is UNVERIFIED: check `define_subagent`'s live parameters before claiming a seat's row is enforced here** |
| reap (no-zombie) | return / `TaskStop` | a returned sub stays ACTIVE → `manage_subagents` `kill_all` (MANDATORY) |
| worker model | `Agent` `model` param | define-time tier pick (`inherit`/`flash`/`pro`, default `inherit`) — set on the subagent's own definition, not passed at `invoke_subagent` call time |

## Verified caveats
- **Read-only is enforced at the TOOL level.** Define each lens `enable_write_tools=false` + `enable_subagent_tools=false`; the lens then has no write/spawn tool at all → apply-on-main + no-recursion are HARD, not soft. Use it. **Evidence: live-verified 2026-06-22 (this room's own end-to-end run); UNVERIFIED against AG's current primary docs (fetched 2026-08-15 — both params absent from the page, which does not contradict them, only fails to confirm them). Re-run the 2026-06-22 validation before trusting this claim as still-enforced.**
- **Governance auto-leak:** AG auto-injects the project `AGENTS.md` into every sub (`<user_rules>` / `<RULE[AGENTS.md]>`). The standard decontam clause in `lens-prompts.md` (the "IGNORE auto-loaded governance" rule, which names AGENTS.md) is REQUIRED — VERIFIED clean on all lenses (each saw AGENTS.md, none cited it). Keep it.
- **Zombies:** a returned sub stays ACTIVE on AG → main MUST `manage_subagents kill_all` before finishing.
- **Model-pick exists at DEFINE time, not invoke time:** a subagent definition (static `.md` file or a `define_subagent` call) carries a `model` field (`inherit`/`flash`/`pro`, default `inherit`); `invoke_subagent` itself takes no model param. CB does not set the field today, so every lens still runs at `inherit` (the parent model). The field is Gemini-tier-only, so cross-vendor decorrelation likely still needs a HUMAN switching AG's model picker (Claude / Gemini / GPT-OSS) and re-running — whether `model: flash/pro` can pull a Gemini tier out from under a Claude/GPT-OSS PARENT is undocumented on the current primary page, unverified either way. `flash`/`pro` sit on Gemini's own tier scale, not CoalTipple's Claude alias ladder (haiku<sonnet<opus<fable) — there is no CT-recognized rung for `define_subagent` to set, so CoalTipple routing does NOT actuate on AG regardless of the field's raw presence.
- **Concurrency** ~16 before the provider rate-limits (429); nesting allowed to depth 10 — CB's 3–4 lenses fit easily.
- **AG has hooks** (a 5-event engine with a real blocking contract) — **CoalBoard ships no wire into them**, so the AG board stays MANUAL-invoke (no auto-trigger conductor).

## Degrade
A platform with no read-only/leaf toggle OR no reap tool → fall back to the SKILL's conservative path (fewer workers, sequential, flag UNVERIFIED). AG has both → full board.
