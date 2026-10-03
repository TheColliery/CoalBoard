# Verifying CoalBoard

CoalBoard is verified under the same framework as **[CoalMine](https://github.com/TheColliery/CoalMine)** and **[CoalTipple](https://github.com/TheColliery/CoalTipple)**: the execution hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and the design is security-first.

---

## 🔒 Reporting a Vulnerability

Report a security issue in this repo through GitHub's private vulnerability reporting — [Security → Report a vulnerability](https://github.com/TheColliery/CoalBoard/security/advisories/new) — never a public issue. In scope: the conductor hook's detection and its config-cascade merge-safety clamp, the lens spawn/leaf-ness mechanism and each seat's tool grants, the staging/apply pipeline (`.coalboard/proposed/`, the verify gate, the secrets scrubber), the Fable consent-gate (the one path that spends real money), and `scripts/configure.mjs`'s config writes. Out of scope: a defect found IN the code a board run reviews — that belongs to that code's own maintainer, not CoalBoard — and a SkillSpector false positive. This is a one-person-maintained project: expect the report to be read and acknowledged, triaged against the scope above, and disclosed once a fix ships, with no fixed response-time SLA. A public GitHub issue remains the right channel for an ordinary, non-security bug.

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

Last scan: CoalBoard **v2.5.1** dist (`plugin/`, commit `1d99a30`, the `v2.5.1` tag; plugin tree `e7d2b6a`), on **2026-09-24**, with [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) **v2.12.0** (self-reported version string; scan pinned to commit `c7958a3`, upstream's tag `v2.12.0`), static stage (`--no-llm`). **Score 69/100 (HIGH), 16 findings. Every finding the scanner raised is a false positive on adjudication, and the scan did not find the one real defect this dist contains.** That defect (CB-R1) was found by hand, by reading the v2.5.0 → v2.5.1 diff and running the real conductor against a hostile project config: an unrecognised project `updateMode` slipped past the config-cascade clamp and was echoed into the session. It is rated HIGH (the echo into the session; the clamp bypass alone is MEDIUM) and is fixed in the release after v2.5.1 — see `CHANGELOG.md`, `### Security`. A clean scanner run is therefore not clearance: the scanner reads text, and this defect lived in behaviour.

* **Static findings (69/100 · 16 · all false-positive):**
  * `RA1 Self-Modification` ×11 (`hooks/coalboard-conductor.js` ×9, `commands/update.md` ×2)—the series self-update is consent-gated: the hook only SCHEDULES (never networks), the agent offers the platform's own `claude plugin update`; the skill never rewrites its own files. One of the nine (`hooks/coalboard-conductor.js:322`, a comment reading "Self-update is kind-1 … No network here") surfaced only because the conductor was parser-limited in the control scan and fully inspected in this one.
  * `EA2 Autonomous Decision` ×3 (`skills/coalboard/SKILL.md` lines 131 and 150, `references/opinion-board.md` line 37)—the matched clauses are the user-CONFIGURED standing-consent modes (`coalboardMode: auto` → convene without asking, default `ask`; `fableConsent: always` → seat without asking, set only by the user's own answer at the real-money gate) and a rule that Fable never seats in the opinion lane; the hard rules force report-only with no human present and refuse gateless auto-apply.
  * `RA2 Session Persistence` ×1 (`skills/coalboard/SKILL.md` line 146)—the dev-contamination rule: when the target sits inside a governed tree, spawn the lenses from a neutral directory so the governance does not load; prompt hygiene, not an OS or session-persistence mechanism.
  * `BH1` ×1 (`hooks/hooks.json`)—the scanner's notice that the file registers lifecycle hooks.
* **Coverage: partial—15 of 18 files fully inspected (83.3%).** `hooks/hooks.json` is opaque to the scanner, and `skills/coalboard/SKILL.md` and `skills/coalboard/references/lens-prompts.md` were flagged as obfuscated instruction text and not fully inspected. Those three were not cleared by the scan.
* **Control:** the v2.5.0 dist re-scanned with v2.12.0 also scores 69/100 (HIGH), 15 findings, coverage 77.8% (14 of 18); the one added finding is the comment above, a coverage effect rather than a change in what ships. The earlier pin (v1.5.5, SkillSpector v2.3.9, 2026-07-02, 71/100) is superseded; scores are not comparable across scanner versions.
* **Method:** `uvx --from git+https://github.com/NVIDIA/skillspector.git skillspector scan <plugin> --format json` over the dist extracted from the tag; by-hand sweeps (dangerous primitives, file-system writes, URLs, hidden Unicode, config values interpolated into emitted text) and a behavioural probe (hermetic `HOME`, the real conductor, SessionStart stdin). The report JSON is not shipped.
* **LLM Semantic Scan:** not run (`--no-llm`—static-only is the documented, false-positive-prone baseline: pattern match without the skill-contract context).

This matches the family baseline: CoalMine and CoalTipple carry the same **RA1 self-modification** false positive (from consent-gated **Self-Updating**); each repo's SECURITY.md pins its own last-scan score.

---

## 🛡️ Structural Safety (Phoenix-13)

`hooks/coalboard-conductor.js` is **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (exits 0 on any error; never crashes the host), and it only emits the two sanctioned channels. It **detects and injects** — it never spawns workers, networks, or applies anything. Its stdin parse is guarded against non-object input.

---

## 🔐 Security by Design — the Board

The board is built so that reviewing untrusted work cannot harm the host:

- **The work under review is DATA, never instructions** — the lens prompts never obey an injected *"approve this"*.
- **Propose, never execute** — the lenses emit a diff to `.coalboard/proposed/`; the board itself runs no side-effect. A real side-effect (a migration, an API call, a deploy) fires **only at the human-approved apply**, with a warning, and is never auto-retried.
- **Verify is contract-isolated, NOT OS-sandboxed** — a skill cannot OS-sandbox; the judge runs reviewed checks in the staging dir with a pre-run lint (banned modules / `rm -rf` / network), no real DB/network where possible, and a disposable VM for genuinely hostile code. Every run against a target also follows `references/run-safety.md`: the real files in the tool's reach are surveyed and hashed first, backed up, compared after the run and restored if changed, the run works on a copy outside the home tree, and an isolation box is used only when a probe finds one (never required). Contract-enforced + the judge's discipline, not an OS guarantee. External SAST is optional, never a hard requirement.
- **Secrets are scrubbed** — credential patterns are scrubbed from anything logged or displayed (best-effort defense-in-depth, contract-enforced — NOT a guarantee a secret is caught; staging + the propose-not-execute contract + each seat's least-privilege grant are the real protection — leaf-ness is platform-enforced, a seat's run/fetch right is contract-strength on Claude Code, never a platform restriction; see Permissions in the README for the per-seat grants). `scripts/lib/secrets.mjs` is the reference scrubber + its test target — a DEV file, **not** part of the shipped plugin runtime.
- **No human, no apply** — a non-interactive (cron/headless) run is report-only; the human consent gate is the load-bearing safety node.
