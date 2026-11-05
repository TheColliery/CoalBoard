# CoalBoard plugin

CoalBoard is a consensus and debate board for hard, error-sensitive tasks. On a task that matches its triggers, or when you run `/coalboard` yourself, it convenes several independent lenses in parallel. A judge synthesizes their findings on inputs it has checked, and any proposed change is staged for you to approve. Nothing touches a live file until you sign off.

Its limits:

- It aims to improve correctness. It claims no reliability number.
- Cost is bounded by its own gates, and staging keeps a run from changing your files.
- It is off most of the time. It convenes only on a matching task or on an explicit `/coalboard`.
- Cross-agent support as the manifest states it: verified on Claude Code; Antigravity validated (load only); other platforms designed for, not verified.

## Install

```bash
claude plugin marketplace add TheColliery/CoalBoard
claude plugin install coalboard@coalboard
```

Two other routes were measured on Windows at commit `9a95b29`. Both copy the skill folder, and neither installs the hooks or the commands:

- `npx skills@1.7.6 add TheColliery/CoalBoard --skill '*' --agent claude-code --copy -y` copies the skill's 13 files, identical to the source. It delivers no agents, commands or hooks.
- `apm install TheColliery/CoalBoard --target claude` (APM 0.35.0) lands the skill, 5 agents, 2 commands and 2 hook entries. APM warns that the dependency is unpinned.

## What the hooks run, and when

`hooks/hooks.json` wires two events. Each runs `node` on `hooks/coalboard-conductor.js` through the exec form. Neither entry sets a `matcher` or a `timeout`.

- **SessionStart** prints one line on the session context when any of these holds: the board contract, when `coalboardMode` is not `off`; a self-update note, when an update check is due; or a notice that a config file was unreadable or ignored. With none of them, it prints nothing.
- **UserPromptSubmit** prints a line when the prompt matches the board's error-not-allowed keywords (security, crypto, migrations, high-precision math). A prompt in a non-Latin script with no such match gets a one-line reminder to judge the task by its meaning. Otherwise it prints nothing.

Any other event produces no output. The script is fail-silent: it catches its own errors and exits without output. Its header states the contract: fail-silent, zero dependencies, no network, no spawn, no `process.exit`.

**What it reads:** the global config `~/.claude/.coalboard.json`; the project config, from the first of these that exists: `.claude/coal/coalboard.json`, `.agents/coal/coalboard.json`, `.gemini/coal/coalboard.json`, then the older `.claude/.coalboard.json` and `.coalboard.json`; and the update-check stamp.

**What it writes and deletes:** it writes the update-check timestamp to `~/.claude/coal/coalboard/update-check`, and it deletes the older stamp at `~/.claude/.coalboard-update-check` once the new one is written. It writes no project config.

## What is fetched or sent

The hook sends nothing and opens no connection.

The update check runs only through `/coalboard:update`, which you run or accept. The agent then looks up the latest tag of this repository on GitHub and offers `claude plugin update coalboard@coalboard`. It applies nothing itself.

A board run spawns its lenses as subagents of your own agent, on your account, under your platform's permission gate. The data lens (`agents/cb-data.md`) holds the `WebFetch` and `WebSearch` tools, so its reads leave the machine from your agent. The plugin itself calls no model API and holds no key.

## Data handling

The policy is in [PRIVACY.md](https://github.com/TheColliery/CoalBoard/blob/main/PRIVACY.md). In short:

- **What is stored.** Staged changes, reports and a run's resume checkpoint, all in `.coalboard/` under the project: `proposed/`, `reports/` and `memory/`. The code deletes `memory/` at the end of each run. It sets no retention for `proposed/` and `reports/`; those stay until you delete them. A run that executes a command against your target makes a lab clone outside your home folder and removes it when the run ends. On Windows it restricts that folder to your user.
- **Project config.** One key, `fableConsent`, is written to the project config, and only when you answer "always, this project" at the real-money prompt.
- **Who can read it.** Anyone with access to your user account or the project folder. The code sets no further access control.
- **Credential patterns.** The skill tells the agent to scrub credential-shaped strings from what it logs or displays. That is a best-effort rule the agent follows. The plugin ships no scrub function, so a secret may still appear in a report. Do not rely on the scrub.
- **Error reports.** Nothing is submitted automatically. Your agent may offer to open a pre-filled issue, and you review it first.

## Example uses

1. **`/coalboard` on a hard problem.** The board convenes lenses on the task and returns a judged verdict. It stages any fix in `.coalboard/proposed/`, and asks for your decision before anything reaches a live file.
2. **`/coalboard` on a named file or a whole repository, as an audit.** It runs the audit procedure, with its scope confirmed first, and writes a report to `.coalboard/reports/`. It changes no live file.
3. **The opinion lane ("ask CB").** When the agent is about to ask you to settle a decision, it can offer an "ask CB" option, marked with its cost. Choosing it convenes the lenses on that decision. It writes no file, and it never convenes on its own.
4. **`/coalboard:stats`.** It prints a table of this session's boards, lenses, verdicts and staged changes, with approximate token spend. It changes no file.
5. **`/coalboard:update`.** It checks for a newer tagged version and offers the update. It installs nothing.

Nothing in these touches a live file until you approve it.

## Commands

- `/coalboard`: the skill. It convenes the board on a task, or runs the audit or the opinion lane.
- `/coalboard:stats`: a read-only report of this session's board activity.
- `/coalboard:update`: a consent-gated check for a newer version, and the setting for how often the check runs.

## Report a problem

Open an issue at <https://github.com/TheColliery/CoalBoard/issues>. For a security problem, use GitHub's private vulnerability reporting, linked from [SECURITY.md](https://github.com/TheColliery/CoalBoard/blob/main/SECURITY.md), and not a public issue. The data policy is in [PRIVACY.md](https://github.com/TheColliery/CoalBoard/blob/main/PRIVACY.md).

## Licence

CoalBoard is licensed under Apache-2.0.
