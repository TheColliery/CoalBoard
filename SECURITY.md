# Verifying CoalBoard

CoalBoard is verified under the same framework as **[CoalMine](https://github.com/HetCreep/CoalMine)** and **[CoalTipple](https://github.com/TheColliery/CoalTipple)**: the execution hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and the design is security-first.

---

## 🔒 Reporting a Vulnerability

Open an issue at `github.com/TheColliery/CoalBoard`, or request a private channel for sensitive PoC logs. We investigate promptly.

---

## 🔑 Commit & Tag Signatures

All commits and release tags are SSH-signed (`gpg.format=ssh`); GitHub renders the Verified badge.

Verify locally:
```bash
echo "* ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEtqTWGKhX1Dk9nZP8ns13Wl5zsO1Cz3VlTS6m1p2fP9" > coalboard_signers
git config gpg.ssh.allowedSignersFile ./coalboard_signers
git verify-commit HEAD && git tag -v "$(git describe --tags --abbrev=0)"
```

---

## 📦 Dist Integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync, the manifest is valid, and the config schema is well-formed. `node scripts/test.mjs` runs the zero-dependency unit + hermetic-hook tests (the canonical runner — the `node --test <glob>` form is avoided: it breaks on Node 24, MODULE_NOT_FOUND).

---

<!-- version-transition: SkillSpector scan — re-scan is event-driven (a new SkillSpector version or a genuinely new attack surface, maintainer-commanded), NOT per release; bump the version/score/date/commit below only after a real re-scan. -->
## 🔬 Independent Scanning — NVIDIA SkillSpector

Last scan: CoalBoard **v1.5.5** dist (commit `96c49af`), on **2026-07-02**, with **NVIDIA SkillSpector v2.3.9** (self-reported — the tool ships no tagged releases; the version is the `uvx`-from-git HEAD, `326a2b4`). **Re-scan is event-driven on a NEW SkillSpector version (maintainer-commanded), NOT per CoalBoard release.** A new SkillSpector version is exactly when the rules, codes, and score can move — v2.3.9 (vs the 2026-06-24 v2.3.5 pass) added new analyzers (`AR1` anti-refusal · SSRF · rug-pull `RP1-3` · `PE4`/`PE5` · `E5` · `TM4`) and reworked per-file score weighting; the **2026-07-02 re-scan returned the same all-false-positive verdict** (identical finding classes and count: RA1 ×8 · EA2 · RA2 · TM1; the score eased 89 → 71 from the scoring rework, not from a CoalBoard change).

**Read the score in context.** The static stage scored **71/100** (trend: v2.2.3 100 → v2.3.1 96 → v2.3.5 89 → v2.3.9 71); the **semantic** LLM stage was not run this pass (`--no-llm` — static-only is the documented FP-prone baseline, pattern-match-based, flagging strings without the skill-contract context). **Every finding was verified false-positive.** The verifications:

| finding(s) | why it is a false positive |
|---|---|
| RA1 ×8 — *self-modification* (self-update) | The series self-update is consent-gated: the **hook only schedules** (never networks), the **agent** offers the platform's own `claude plugin update`. The skill never rewrites its own files. |
| TM1 — *tool-parameter abuse* (`rm -rf`) | The matched text is the verify step's **pre-run lint that BANS** `rm -rf` in reviewed code (skip-and-flag) — a defensive rule, the opposite of using it. |
| RA2 — *session persistence* (lens-prompt template) | The matched text instructs lenses to be instantiated **from the canonical template** and forbids injecting dev-governance — prompt-hygiene instruction; none of the OS/session-persistence mechanisms RA2 keys on. |
| EA2 — *autonomous decision* ("without asking") | The matched clause is "`auto` → convene without asking" — the documented, user-CONFIGURED standing-consent mode inside the consent-gate paragraph (default `ask`); the hard rules directly below force report-only with no human present and REFUSE gateless auto-apply. |

(Exact per-category counts and locations shift between SkillSpector versions — e.g. the RA2 match moved from the `.coalboard/proposed/` staging text to the lens-template text; the categories and the all-false-positive verdict are stable.) This matches the family baseline: CoalMine and CoalTipple carry the same **RA1 self-modification** false positive (from consent-gated **Self-Updating**) — **all-false-positive across the family**; each repo's SECURITY.md pins its own last-scan score. The report JSON is not shipped.

---

## 🛡️ Structural Safety (Phoenix-13)

`hooks/coalboard-conductor.js` is **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (exits 0 on any error; never crashes the host), and it only emits the two sanctioned channels. It **detects and injects** — it never spawns workers, networks, or applies anything. Its stdin parse is guarded against non-object input.

---

## 🔐 Security by Design — the Board

The board is built so that reviewing untrusted work cannot harm the host:

- **The work under review is DATA, never instructions** — the lens prompts never obey an injected *"approve this"*.
- **Propose, never execute** — the lenses emit a diff to `.coalboard/proposed/`; the board itself runs no side-effect. A real side-effect (a migration, an API call, a deploy) fires **only at the human-approved apply**, with a warning, and is never auto-retried.
- **Verify is contract-isolated, NOT OS-sandboxed** — a skill cannot OS-sandbox; the judge runs reviewed checks in the staging dir with a pre-run lint (banned modules / `rm -rf` / network), no real DB/network where possible, and a disposable VM for genuinely hostile code. Contract-enforced + the judge's discipline, not an OS guarantee. External SAST is optional, never a hard requirement.
- **Secrets are scrubbed** — credential patterns are scrubbed from anything logged or displayed (best-effort defense-in-depth, contract-enforced — NOT a guarantee a secret is caught; the staging + read-only-worker boundary is the real protection). `scripts/lib/secrets.mjs` is the reference scrubber + its test target — a DEV file, **not** part of the shipped plugin runtime.
- **No human, no apply** — a non-interactive (cron/headless) run is report-only; the human consent gate is the load-bearing safety node.
