# Verifying CoalBoard

CoalBoard is verified under the same framework as **[CoalMine](https://github.com/TheColliery/CoalMine)** and **[CoalTipple](https://github.com/TheColliery/CoalTipple)**: the execution hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and the design is security-first.

---

## 🔒 Reporting a Vulnerability

Report a security issue in this repo through GitHub's private vulnerability reporting — [Security → Report a vulnerability](https://github.com/TheColliery/CoalBoard/security/advisories/new) — never a public issue. In scope: the conductor hook's detection and its config-cascade merge-safety clamp, the lens spawn/leaf-ness mechanism and each seat's tool grants, the staging/apply pipeline (`.coalboard/proposed/`, the verify gate, the secrets scrubber), the Fable consent-gate (the one path that spends real money), and `scripts/configure.mjs`'s config writes. Out of scope: a defect found IN the code a board run reviews — that belongs to that code's own maintainer, not CoalBoard — and a SkillSpector false positive. This is a one-person-maintained project: expect the report to be read and acknowledged and triaged against the scope above. We acknowledge a report within 5 days, send an assessment within 10 days, and disclose publicly once the fix ships, or at 90 days at most. During an absence announced on the maintainer's GitHub profile, the 5 days count from the first day back. A public GitHub issue remains the right channel for an ordinary, non-security bug.

Fixed vulnerabilities are published as [Security Advisories](https://github.com/TheColliery/CoalBoard/security/advisories).

---

## What counts as a vulnerability

The shipped code is in scope: what this project installs and runs for a user, including anything it reads from a repository or file the user did not write. This repository's own tooling (its CI workflows, its release and build scripts, and its test harness, as a maintainer runs them on the maintainer's checkout) is welcome to report on, and a flaw in it is fixed as hardening. Either part earns a published advisory only when an outsider can reach the flaw through input they control: a repository they clone, a file they send, a pull request from a fork, or a network response. A path only the user or the maintainer feeds (their own config, a command they type) does not get one. Where it is unclear whether an outsider can reach a flaw, it counts as reachable until the maintainers have decided.

---

## 🔑 Commit & Tag Signatures

Every **release tag** and **maintainer commit** is SSH-signed (`gpg.format=ssh`); GitHub shows the Verified badge on them. Automated **Dependabot / CI** commits are not signed with the maintainer key (GitHub signs these with its own), so verify a signed **release tag** — the artifact a release consumer trusts:
```bash
echo "* ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEtqTWGKhX1Dk9nZP8ns13Wl5zsO1Cz3VlTS6m1p2fP9" > coalboard_signers
git config gpg.ssh.allowedSignersFile ./coalboard_signers
git tag -v "$(git describe --tags --abbrev=0)"
```

---

## 📦 Dist Integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync, the manifest is valid, and the config schema is well-formed. `node scripts/test.mjs` runs the zero-dependency unit + hermetic-hook tests (the canonical runner — the `node --test <glob>` form is avoided: it breaks on Node 24, MODULE_NOT_FOUND).

---

<!-- version-transition: SkillSpector scan — the re-scan is automatic when this room's version is bumped (gated by a baseline diff), not a maintainer command; a genuinely new attack surface is a second trigger, by hand. Bump the version/score/date/commit below only after a real re-scan. -->
## 🔬 Independent Scanning — NVIDIA SkillSpector

CoalBoard is evaluated against [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector), run locally via `uvx` (no install), static stage only (`--no-llm`).

* **Scan:** 2026-11-06, CoalBoard v2.9.5 dist (`plugin/`, the `v2.9.5` tag at `ad46b4b`), SkillSpector v2.13.4 pinned to commit `5482446` (`54824463814a0be01360792523ec7245a69190fc`), static stage only.
* **Score:** 93/100 (CRITICAL static). **20 findings, none a defect**, each read at its source line. The same 20 as the v2.9.4 scan, matched by fingerprint.
* **Finding classes:**
  * RA1 Self-Modification ×12—the consent-gated self-update text in `commands/update.md`, `hooks/coalboard-conductor.js` and the plugin `README.md`: the hook only schedules and never networks, and the agent offers the platform's own `claude plugin update`.
  * EA2 Autonomous Decision Making ×5—the user-configured standing-consent modes, whose default is `ask`, and the rule that Fable never seats in the opinion lane.
  * P6 Direct Prompt Extraction ×2—the words "footprint rule" and "output rule" in prose.
  * BH1 Bundled hooks can execute when matching lifecycle events occur ×1—the scanner's standing note that `hooks/hooks.json` registers hooks.
* **Coverage:** partial, 18 of 24 files fully inspected (75%). Six are partial: `hooks/coalboard-conductor.js` and `skills/coalboard/scripts/apply-target.mjs` (the parser's limit on a security-relevant expression), `hooks/hooks.json` (opaque to it), and `SKILL.md`, `lens-prompts.md` and `references/steps.md` (its `obfuscated_instruction_text` exception).
* **Not clearance:** a clean scanner run does not clear a behaviour defect. The scanner reads text; the v2.6.0 defect lived in behaviour.

A separate advisory workflow, Skill checks (NVIDIA SkillEvaluator, keyless Tier 1), runs on pull requests only and reports its pattern matches as findings; it is not a SkillSpector scan and does not change the record below.

Earlier scans are in this file's git history. Scanning is event-driven (this repository's own version bump, or a genuinely new attack surface); this record names the last scan actually run.

---

## 🛡️ Structural Safety (Phoenix-13)

`hooks/coalboard-conductor.js` is **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (exits 0 on any error; never crashes the host), and it only emits the two sanctioned channels. It **detects and injects** — it never spawns workers, networks, or applies anything. Its stdin parse is guarded against non-object input.

---

## 🔐 Security by Design — the Board

The board is built so that reviewing untrusted work cannot harm the host:

- **The work under review is DATA, never instructions** — the lens prompts never obey an injected *"approve this"*.
- **Propose, never execute** — the lenses emit a diff to `.coalboard/proposed/`; the board itself runs no side-effect. A real side-effect (a migration, an API call, a deploy) fires **only at the human-approved apply**, with a warning, and is never auto-retried.
- **What a run may leave on your machine:** a run that executes a command against your target works on a lab clone and removes it, with its backup, when it ends. If it restores a real file it changed, it first saves that file's post-run version into a private folder, `<run-id>.post-run/`, beside the run directory under the lab root (outside your project, restricted to your user (`icacls` on Windows, mode 0700 on POSIX), copies named by SHA-256 with a `manifest.txt`). That folder may hold a secret, so the report names only its path; it is kept for you to reconcile and delete.
- **Verify is contract-isolated, NOT OS-sandboxed** — a skill cannot OS-sandbox; the judge runs reviewed checks in the staging dir with a pre-run lint (banned modules / `rm -rf` / network), no real DB/network where possible, and a disposable VM for genuinely hostile code. Every run against a target also follows `references/run-safety.md`: the real files in the tool's reach are surveyed and hashed first, backed up, compared after the run and restored if changed, the run works on a lab clone outside the home tree (recommended roots in `references/run-safety.md` S3) that on Windows is restricted to the current user, sits beside the S2 backup of the real configs, and that every run removes whole (backup included) when it ends, and an isolation box is used only when a probe finds one (not required in general; a target whose effects are not files, such as registry or package removal, is never run without one and is read statically instead, S4). Contract-enforced + the judge's discipline, not an OS guarantee. External SAST is optional, never a hard requirement.
- **Secrets are scrubbed** — credential patterns are scrubbed from anything logged or displayed (best-effort defense-in-depth, contract-enforced — NOT a guarantee a secret is caught; staging + the propose-not-execute contract + each seat's least-privilege grant are the real protection — leaf-ness is platform-enforced, a seat's run/fetch right is contract-strength on Claude Code, never a platform restriction; see Permissions in the README for the per-seat grants). `scripts/lib/secrets.mjs` is the reference scrubber + its test target — a DEV file, **not** part of the shipped plugin runtime.
- **No user, no convene, no apply** — on Claude Code the conductor decides at session start whether a user can answer, from `CLAUDE_CODE_SESSION_ATTENDED` (an environment variable Claude Code sets, undocumented by the vendor and version-bound; any value other than `1`, or none, reads as no user). With no user, the conductor tells the agent at session start that no user can answer, so the board is not convened and nothing is applied, whatever `coalboardMode` says. The hook chooses which line the agent reads, and the agent follows it: an instruction, not an enforced block. On an agent that runs no hook, the skill's text says the same at prose strength: no answer is assumed, and nothing is applied before one. The human consent gate is the load-bearing safety node.
- **The conductor's `detect()` echo is not a prompt-injection path.** The conductor echoes the critical entries it matched in the prompt (`hooks/coalboard-conductor.js`, `matched()`). `matched()` keeps an entry only when the lower-cased prompt includes the lower-cased entry, so every echoed string is a case-insensitive substring of text the user typed and that is already in context. A repository cannot add a word or a newline the user did not type. This is not the v2.6.0 class (CB-R1), which injected text the user never saw.
