# CoalBoard plugin

CoalBoard is a consensus and debate board for hard, error-sensitive tasks. It convenes several independent lenses in parallel on a task that matches its triggers, on an explicit `/coalboard`, or when you pick "ask CB" from the opinion lane. A judge synthesizes their findings on inputs it has checked. Any proposed change is staged in `.coalboard/proposed/`, and a file in your project changes only after you approve it at the disposition step.

Its limits:

- It aims to improve correctness. It claims no reliability number.
- Cost is bounded by its own gates. Staging keeps proposed fixes out of your files until you approve them.
- Run safety detects a file that a command changed during a run and restores it. It does not prevent the change, and it is not an operating-system sandbox.
- It is off most of the time. Its default `coalboardMode` is `ask`, so it asks before convening; `auto` convenes without asking.
- Cross-agent support as the manifest states it: verified on Claude Code; Antigravity validated (load only); other platforms designed for, not verified.

## Install

```bash
claude plugin marketplace add TheColliery/CoalBoard
claude plugin install coalboard@coalboard
```

Two other routes were measured on Windows at commit `9a95b29`. Each copies the skill folder:

- `npx skills@1.7.6 add TheColliery/CoalBoard --skill '*' --agent claude-code --copy -y` copies the skill's 13 files, identical to the source. It delivers no agents, commands or hooks.
- `apm install TheColliery/CoalBoard --target claude` (APM 0.35.0) lands the skill, 5 agents, 2 commands and 2 hook entries. The probe counted the hook entries; it did not run them. APM warns that the dependency is unpinned.

## What the hooks run, and when

`hooks/hooks.json` wires two events. Each runs `node` on `hooks/coalboard-conductor.js` through the exec form. Neither entry sets a `matcher` or a `timeout`.

- **SessionStart** prints one line on the session context when any of these holds: the board contract, when `coalboardMode` is not `off`; a self-update note, when an update check is due; or a notice that a config file was unreadable or ignored. With none of them, it prints nothing.
- **UserPromptSubmit** prints nothing when `coalboardMode` is `off`. Otherwise it prints a line when the prompt matches the board's error-not-allowed keywords (security, crypto, migrations, high-precision math). A prompt in a non-Latin script with no such match gets a one-line reminder to judge the task by its meaning.

Any other event produces no output. The script is fail-silent: it catches its own errors and exits without output. Its header states the contract: fail-silent, zero dependencies, no network, no spawn, no `process.exit`.

**What it reads:** the global config `~/.claude/.coalboard.json`; and the project config. The project config is searched from the current folder upward, stopping before your home folder. In the first folder that holds one, the first of these that exists wins: `.claude/coal/coalboard.json`, `.agents/coal/coalboard.json`, `.gemini/coal/coalboard.json`, then the older `.claude/.coalboard.json` and `.coalboard.json`. It also reads the update-check stamp.

**What it writes and deletes:** when an update check is due, it writes the timestamp to `~/.claude/coal/coalboard/update-check`. It deletes the older stamp at `~/.claude/.coalboard-update-check` once the new one is written. It writes no project config.

## What is fetched or sent

The hook sends nothing and opens no connection. Each of these happens only in the case stated.

- **The update check** runs `git ls-remote` against this repository on GitHub, and it is read-only. It runs through `/coalboard:update`. Under `updateMode: ask` (the default) the agent offers the check when one is due, and the read happens only if you accept. Under `auto` it runs when due, without asking again. Under `remind` it makes no network call, and the agent only tells you a check is due. Under `off` nothing is printed and no check runs. Whichever mode you pick, the update is applied only by `claude plugin update coalboard@coalboard`, which you run.
- **A board run's data lens** (`agents/cb-data.md`) holds `WebFetch` and `WebSearch`, so it reads public pages from your agent.
- **The opinion lane's realtime seat** holds shell and fetch access, and it reads live sources to measure what is now.
- **The adversary and feeling seats** (`agents/cb-adversary.md`, `agents/cb-feeling.md`) hold `Bash`. They may run commands to test a claim, under run safety.
- **The main agent** reads the target's own open code-scanning, Dependabot and secret-scanning alert lists with a read-only GitHub request, using whatever read access your environment already has. The secret-scanning request asks GitHub not to return the secret value.
- **Lenses** are subagents of your agent, on your account, under your platform's permission gate. The plugin calls no model API and holds no key.

## Data handling

The policy is in [PRIVACY.md](https://github.com/TheColliery/CoalBoard/blob/main/PRIVACY.md). In short:

- **What is stored.** Under `.coalboard/` in the project: `proposed/` (staged fixes), `reports/` (audit reports and post-mortems) and `memory/` (a worker's resume checkpoint). The skill tells the agent to delete `memory/` when each run ends. The code sets no retention for `proposed/` and `reports/`, so they stay until you delete them.
- **Run safety.** A command that runs against your target works on a lab clone outside your home folder, which the skill instructs the agent to remove when the run ends. A file the run changed in your project is restored from a backup. Its post-run version is first saved to `<run-id>.post-run/`, a folder beside the run directory under the lab root. The folder is restricted to your user, and it may hold a secret. It is kept after the run for you to reconcile and delete, and the report names its path.
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

## Commands

- `/coalboard`: the skill. It convenes the board on a task, or runs the audit or the opinion lane.
- `/coalboard:stats`: a read-only report of this session's board activity.
- `/coalboard:update`: a consent-gated check for a newer version, and the setting for how often the check runs.

## Report a problem

Open an issue at <https://github.com/TheColliery/CoalBoard/issues>. For a security problem, use GitHub's private vulnerability reporting, linked from [SECURITY.md](https://github.com/TheColliery/CoalBoard/blob/main/SECURITY.md), and not a public issue. The data policy is in [PRIVACY.md](https://github.com/TheColliery/CoalBoard/blob/main/PRIVACY.md).

## Licence

CoalBoard is licensed under Apache-2.0.
