# Verifying CoalBoard

CoalBoard is verified under the same framework as **[CoalMine](https://github.com/HetCreep/CoalMine)** and **[CoalTipple](https://github.com/TheColliery/CoalTipple)**: the execution hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and the design is security-first.

---

## 🔒 Reporting a Vulnerability

Open an issue at `github.com/TheColliery/CoalBoard`, or request a private channel for sensitive PoC logs. We investigate promptly.

---

## 🔑 Commit & Tag Signatures

All commits and release tags are SSH-signed (`gpg.format=ssh`); GitHub renders the Verified badge. Verify locally with `git verify-commit HEAD` and `git tag -v "$(git describe --tags --abbrev=0)"`.

---

## 📦 Dist Integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync, the manifest is valid, and the config schema is well-formed. `node scripts/test.mjs` runs the zero-dependency unit + hermetic-hook tests (the canonical runner — the `node --test <glob>` form is avoided: it breaks on Node 24, MODULE_NOT_FOUND).

---

<!-- version-transition: SkillSpector scan — re-scan is event-driven (a new SkillSpector version or a genuinely new attack surface, maintainer-commanded), NOT per release; bump the version/score/date/commit below only after a real re-scan. -->
## 🔬 Independent Scanning — NVIDIA SkillSpector

Last scan: CoalBoard **v1.0.12** dist (commit `c67d90b`), on **2026-06-20**, with **NVIDIA SkillSpector v2.2.3** (self-reported — the tool ships no tagged releases; the version is the `uvx`-from-git HEAD). **Re-scan is event-driven on a NEW SkillSpector version (maintainer-commanded), NOT per CoalBoard release** — the static analyzers are stable (unchanged since 2026-05-11), so a CoalBoard content bump does not change what these (non-MCP) rules read. The **2026-06-20 re-scan of the v1.0.12 dist CONFIRMS this**: same SkillSpector v2.2.3, same all-false-positive verdict, the findings unchanged in class from the earlier v1.0.1 scan.

**Read the score in context.** The static stage scored **100/100**; the LLM **semantic** stage was rate-limited (HTTP 429) and fell back to **static-only**, which is pattern-match-based and false-positive-prone (it flags strings without the skill-contract context). **Every finding was verified false-positive** — re-run the semantic stage when the limit clears for a context-aware score. The verifications:

| finding(s) | why it is a false positive |
|---|---|
| RA1 ×6 — *self-modification* (self-update) | The series self-update is consent-gated: the **hook only schedules** (never networks), the **agent** offers the platform's own `claude plugin update`. The skill never rewrites its own files. |
| TM1 — *tool-parameter abuse* (`rm -rf`) | The matched text **instructs the agent to lint-for and skip-flag** `rm -rf` in reviewed code — a defensive rule, the opposite of using it. |
| RA2 — *session persistence* (`.coalboard/proposed/`) | The staging dir is the **propose-not-execute** safety mechanism (nothing reaches live until the human approves), not attacker persistence. |
| EA2 — *autonomous decision* | The cited snippet itself mandates **"default ASK, via the question-box"** — the human consent gate is present. |
| EA3 ×2 — *scope creep* ("not limited to") | The manual `/coalboard` breadth is the **deliberate, consent-gated** two-scope design (auto narrow, manual broad). |
| SQP-1/2, SDI-2 ×2 | `/coalboard` is a **manual** command (not accidentally triggerable); "no executable code" is wrong (`hooks/coalboard-conductor.js` ships in the dist); the git tag-check is a read-only, by-design lookup. |

(Exact per-category counts shift slightly between static runs — the 2026-06-20 re-scan returned 11 findings: RA1×6 · EA3×2 · EA2 · RA2 · TM1; the categories above and the all-false-positive verdict are stable. The SQP/SDI row was an LLM-semantic-stage finding from an earlier run; the 2026-06-20 static pass — the LLM stage was HTTP-429 rate-limited — did not raise them.) This matches the family baseline: all three skills now score **100/100 static** — CoalMine + CoalTipple rose from 58/100 + 10/100 after they shipped consent-gated **Self-Updating**, which the static **RA1 self-modification** rule flags as the same false positive seen here — **all-false-positive across the family**. The report JSON is not shipped.

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
