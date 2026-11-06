# Verifying CoalBoard

CoalBoard is verified under the same framework as **[CoalMine](https://github.com/TheColliery/CoalMine)** and **[CoalTipple](https://github.com/TheColliery/CoalTipple)**: the execution hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and the design is security-first.

---

## 🔒 Reporting a Vulnerability

Report a security issue in this repo through GitHub's private vulnerability reporting — [Security → Report a vulnerability](https://github.com/TheColliery/CoalBoard/security/advisories/new) — never a public issue. In scope: the conductor hook's detection and its config-cascade merge-safety clamp, the lens spawn/leaf-ness mechanism and each seat's tool grants, the staging/apply pipeline (`.coalboard/proposed/`, the verify gate, the secrets scrubber), the Fable consent-gate (the one path that spends real money), and `scripts/configure.mjs`'s config writes. Out of scope: a defect found IN the code a board run reviews — that belongs to that code's own maintainer, not CoalBoard — and a SkillSpector false positive. This is a one-person-maintained project: expect the report to be read and acknowledged and triaged against the scope above. We acknowledge a report within 5 days, send an assessment within 10 days, and disclose publicly once the fix ships, or at 90 days at most. During an absence announced on the maintainer's GitHub profile, the 5 days count from the first day back. A public GitHub issue remains the right channel for an ordinary, non-security bug.

Fixed vulnerabilities are published as [Security Advisories](https://github.com/TheColliery/CoalBoard/security/advisories).

An advisory is published only for a finding an outsider can exploit through input they control, whatever its level: a repository the user cloned, a file sent to them, a reply from the network. A path only the user feeds (their own config, a command they type) does not count. An unsure finding counts and goes to CoalBoard to decide.

---

## 🩹 Fixed Security Issues

Each of these stays here until its advisory is published.

* **v2.8.7 (2026-10-19): the apply check could judge a relative target joined to the root while a writer sent it to another drive.** On Windows a relative target that starts with a drive letter and a colon (`z:foo/x.txt`) is resolved against that drive, not the project root, so a writer that resolves such a target would land on `z:\foo\x.txt` while the checker had judged it joined to the root. The shipped checker `skills/coalboard/scripts/apply-target.mjs` now refuses, on every platform, a relative target that starts with a drive prefix, with the reason `name`, and a refused target is named in the digest and the report as not applicable. An absolute target is not affected: a drive prefix counts only at the very start of a path. The 2.8.6 name rule also refuses a dot or a space right before a stream colon. That the agent runs the checker is an instruction it follows, a mitigation and not a guarantee. What ran here, on Windows 11: the refusal in both letter cases and the controls that stay allowed, red first and then green, and a mutant table of eight (seven killed; the one that refuses only on Windows survives on this host and is for a POSIX CI runner to kill). See `CHANGELOG.md`, `### Security` under 2.8.7.
* **v2.8.6 (2026-10-18): the apply check could judge one spelling of a name and the write land on another.** On Windows a path component that ends in a dot or a space is stripped by the system, so `foo.` and `foo` name one file, and a target spelled with such an ending could be checked under one spelling and written under the other. The shipped checker `skills/coalboard/scripts/apply-target.mjs` now refuses, on every platform, a target with a segment below the project root that ends in a dot or a space, with the reason `name`, and a refused target is named in the digest and the report as not applicable, so "apply all" never covers it. The segments of the project root itself are not judged. That the agent runs the checker is an instruction it follows, a mitigation and not a guarantee. What ran here, on Windows 11: the refusal in both the relative and the absolute spelling, and a root with a trailing-dot folder above it (that folder can be made on this machine, so the leg ran); the file-symlink legs of the same test file still skip here by a capability probe and are expected to run on the Linux and macOS CI runners. See `CHANGELOG.md`, `### Security` under 2.8.6.
* **v2.8.4 (2026-10-16): applying an approved fix could write through a planted link.** The final consent step (GATE 3) named each apply target by its path and then wrote to it, so a symlink or junction planted in a cloned repository, at the target or on the way to it, sent the write to the link's target, possibly a file outside the project. The skill now runs a shipped checker, `skills/coalboard/scripts/apply-target.mjs`, on every target before the digest and again before each live write; it refuses a link at or below the project root (a link above the root is allowed), a target whose real path leaves the root, and an unresolvable path (fail closed), and a refused target is never written. The checker writes nothing and reads only path metadata. That the agent runs it is an instruction the agent follows, a mitigation and not a guarantee; once it runs its verdict is exact, and if it cannot run no live file is written. An absolute target's `..` steps after a link are judged by the real parent: that was red first and then green here, on Windows junctions; the POSIX behaviour it guards (the system resolves a symlink before it applies `..`) is the mechanism, inferred, and was not run here. A window remains between the last check and the write, which a local process could use. What ran here, on Windows 11: directory junctions as the target's directory, in the middle of the path, to a folder inside the root, at the target name and above the root, and with a real access-denied file (refused as unresolvable); the file-symlink legs skip here by a capability probe (this machine cannot create a file symlink) and are expected to run on the Linux and macOS CI runners, where file symlinks need no privilege; the runner's log counts files, not tests, so their unskipped run there is inferred, not shown. See `CHANGELOG.md`, `### Security` under 2.8.4.
* **v2.8.3 (2026-10-15): a planted link could make the hook read a config outside the project.** A junction or symlink in a cloned repository (at `.claude`, `.claude/coal`, `.agents`, the legacy config location, or the config file itself) could point the session hook at a file outside the project. The hook now reads the project config only after its real path is confirmed to sit inside the folder it expects, and reports a refusal on the session-start line. The skill also checks for a link before it reads, writes or deletes under `.coalboard/` (or writes the project config), against the project root's real path and any link at or below `.coalboard`, and its memory cleanup removes only the files the run created, by name, then a non-recursive `rmdir` of `memory/` only if it is a real directory; that second half is an instruction the agent follows, a mitigation and not a guarantee. Verified on Windows 11 with directory junctions at `.claude`, `.claude/coal`, `.agents`, the legacy location and an in-project junction outside the expected folder; a cross-drive leg ran here (a preload stands in for the second volume); the file-symlink legs skip on a machine that cannot create a file symlink (this one) and are expected to run on the Linux and macOS CI runners, where file symlinks need no privilege; the runner's log counts files, not tests, so their unskipped run there is inferred, not shown. See `CHANGELOG.md`, `### Security` under 2.8.3.
* **v2.6.0 (2026-10-01): a project config could inject text into the session.** CB-R1 was found by hand (an unrecognised project `updateMode` slipped past the config-cascade clamp and was echoed into the session; rated HIGH, the clamp bypass alone MEDIUM) and is fixed since v2.6.0 — see `CHANGELOG.md`, `### Security`. A clean scanner run is therefore not clearance: the scanner reads text, and that defect lived in behaviour.

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

* **Scan:** 2026-11-06, CoalBoard v2.9.4 dist (`plugin/`, the `v2.9.4` tag at `3d18785`; the scanned tree is `1b0504f`, whose `plugin/` and `.claude-plugin/` equal the tag's), SkillSpector v2.13.4 pinned to commit `5482446` (`54824463814a0be01360792523ec7245a69190fc`).
* **Score:** 93/100 (CRITICAL static). **20 findings, none a defect**, each read at its source line.
* **Finding classes:**
  * RA1 Self-Modification ×12—the consent-gated self-update text in `commands/update.md`, `hooks/coalboard-conductor.js` and the plugin `README.md`: the hook only schedules and never networks, and the agent offers the platform's own `claude plugin update`.
  * EA2 Autonomous Decision Making ×5—the user-configured standing-consent modes, whose default is `ask`, and the rule that Fable never seats in the opinion lane.
  * P6 Direct Prompt Extraction ×2—the words "footprint rule" and "output rule" in prose, matched as a print rule.
  * BH1 Bundled hooks can execute when matching lifecycle events occur ×1—the scanner's standing note that `hooks/hooks.json` registers hooks.
* **Coverage:** partial, 19 of 24 files fully inspected (79.2%). `hooks/coalboard-conductor.js` hit the scanner's parse limit (a security-relevant expression it could not fully resolve), `hooks/hooks.json` is opaque to it, and `SKILL.md`, `lens-prompts.md` and `references/steps.md` carry its `obfuscated_instruction_text` exception, so the scan did not clear those five.

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
- **No human, no apply** — a non-interactive (cron/headless) run is report-only; the human consent gate is the load-bearing safety node.
- **The conductor's `detect()` echo is not a prompt-injection path.** The conductor echoes the critical entries it matched in the prompt (`hooks/coalboard-conductor.js`, `matched()`). `matched()` keeps an entry only when the lower-cased prompt includes the lower-cased entry, so every echoed string is a case-insensitive substring of text the user typed and that is already in context. A repository cannot add a word or a newline the user did not type. This is not the v2.6.0 class (CB-R1), which injected text the user never saw.
