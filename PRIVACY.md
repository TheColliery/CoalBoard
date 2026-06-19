# CoalBoard Privacy Policy

**CoalBoard collects nothing and phones nowhere.**

- **No telemetry.** No usage data, analytics, or identifiers are collected, stored, or transmitted — by the skill, the conductor hook, or any bundled component.
- **No network calls from the hook.** The conductor hook is offline by design (Phoenix Commandment #7): it reads the prompt and `.coalboard.json` locally and emits an advisory directive. It opens no sockets and makes no requests. (The self-update *check* is the agent's `/coalboard:update` procedure, run only with your consent — never the hook.)
- **The board runs inside YOUR agent.** CoalBoard operates no servers and receives no traffic. When it convenes, it spawns lens workers through your agent's *own* native subagent tool, on your account, under your platform's permission gate — CoalBoard calls no model API itself and does not bypass that gate.
- **Propose, never execute.** The board writes proposals to a local `.coalboard/proposed/` staging directory; nothing touches your live files or fires a side-effect until you approve. Credential patterns are scrubbed from anything logged or displayed on a **best-effort, contract-enforced** basis (the agent applies the scrubbing per the skill; the reference scrubber `scripts/lib/secrets.mjs` is a DEV file, **not** shipped in the plugin runtime) — defense-in-depth, never a guarantee a secret is caught.
- **Error reports are manual.** When a component misbehaves, your agent may *offer* to open a pre-filled GitHub issue; nothing is submitted automatically, and you see and edit the full contents first.
- **Local files only.** All state lives in files you can read: the config (`~/.claude/.coalboard.json` and an optional per-project `.claude/.coalboard.json`) and the project-scoped `.coalboard/` staging directory (`proposed/` = staged changes awaiting your approval · `reports/` = audit reports & post-mortems).

Questions: open an issue at <https://github.com/TheColliery/CoalBoard/issues>.
