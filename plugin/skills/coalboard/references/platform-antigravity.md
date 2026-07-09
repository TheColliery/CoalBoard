# CoalBoard on Antigravity (verified 2026-06-22)

> Loaded ON-DEMAND when running the board on Antigravity. The SKILL.md flow is UNCHANGED — this only maps the platform-agnostic contract to AG's tools + the verified caveats. Validated end-to-end on AG (Claude Opus 4.6) — a self-run validation, not third-party-audited: 3 read-only-leaf lenses → invoke parallel → judge → reap; decontamination clean.

## Tool mapping (Claude Code → Antigravity)
| step | Claude Code | Antigravity |
|---|---|---|
| spawn a lens | `Agent`/`Task` | `define_subagent(enable_write_tools=false, enable_subagent_tools=false)` → `invoke_subagent` |
| read-only + leaf | by-instruction | **TOOL-LEVEL** — the write/spawn tools are ABSENT from the sub (stronger than CC) |
| reap (no-zombie) | return / `TaskStop` | a returned sub stays ACTIVE → `manage_subagents` `kill_all` (MANDATORY) |
| worker model | `Agent` `model` param | NONE — workers inherit the parent model |

## Verified caveats
- **Read-only is enforced at the TOOL level.** Define each lens `enable_write_tools=false` + `enable_subagent_tools=false`; the lens then has no write/spawn tool at all → apply-on-main + no-recursion are HARD, not soft. Use it.
- **Governance auto-leak:** AG auto-injects the project `AGENTS.md` into every sub (`<user_rules>` / `<RULE[AGENTS.md]>`). The standard decontam clause in `lens-prompts.md` (the "IGNORE auto-loaded governance" rule, which names AGENTS.md) is REQUIRED — VERIFIED clean on all lenses (each saw AGENTS.md, none cited it). Keep it.
- **Zombies:** a returned sub stays ACTIVE on AG → main MUST `manage_subagents kill_all` before finishing.
- **No model-pick:** neither `invoke_subagent` nor `define_subagent` takes a model param → lenses run the PARENT model (diversity rides the prompts, not the model). Cross-vendor decorrelation = HUMAN-manual only (switch AG's model picker — Claude / Gemini / GPT-OSS — and re-run; the agent cannot automate it). So CoalTipple routing does NOT actuate on AG.
- **Concurrency** ~16 before the provider rate-limits (429); nesting allowed to depth 10 — CB's 3–4 lenses fit easily.
- **No hooks** on AG → the AG board is MANUAL-invoke (no auto-trigger conductor).

## Degrade
A platform with no read-only/leaf toggle OR no reap tool → fall back to the SKILL's conservative path (fewer workers, sequential, flag UNVERIFIED). AG has both → full board.
