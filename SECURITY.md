# Verifying CoalBoard

CoalBoard is verified under the same framework as **[CoalMine](https://github.com/HetCreep/CoalMine)** and **[CoalTipple](https://github.com/TheColliery/CoalTipple)**: the execution hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and the design is security-first.

## SkillSpector scan

Last scan: **NVIDIA SkillSpector v2.2.3, 2026-06-19**, on the shipped `plugin/` dist (skill + hook + command files). Scanning is periodic, not per-release — an unscanned later version is **not** claimed scanned (re-scan on any skill/hook change). This scan covers the **current shipped dist** (the max-sharpness + anti-zombie hardening included); at the `1.0.0` tag only `plugin.json`'s version and the README change, neither a scanned surface.

**Read the score in context.** The static stage scored **100/100**; the LLM **semantic** stage was rate-limited (HTTP 429) and fell back to **static-only**, which is pattern-match-based and false-positive-prone (it flags strings without the skill-contract context). **Every finding was verified false-positive** — re-run the semantic stage when the limit clears for a context-aware score. The verifications:

| finding(s) | why it is a false positive |
|---|---|
| RA1 ×6 — *self-modification* (self-update) | The series self-update is consent-gated: the **hook only schedules** (never networks), the **agent** offers the platform's own `claude plugin update`. The skill never rewrites its own files. |
| TM1 — *tool-parameter abuse* (`rm -rf`) | The matched text **instructs the agent to lint-for and skip-flag** `rm -rf` in reviewed code — a defensive rule, the opposite of using it. |
| RA2 — *session persistence* (`.coalboard/proposed/`) | The staging dir is the **propose-not-execute** safety mechanism (nothing reaches live until the human approves), not attacker persistence. |
| EA2 — *autonomous decision* | The cited snippet itself mandates **"default ASK, via the question-box"** — the human consent gate is present. |
| EA3 ×2 — *scope creep* ("not limited to") | The manual `/coalboard` breadth is the **deliberate, consent-gated** two-scope design (auto narrow, manual broad). |
| SQP-1/2, SDI-2 ×2 | `/coalboard` is a **manual** command (not accidentally triggerable); "no executable code" is wrong (`hooks/coalboard-conductor.js` ships in the dist); the git tag-check is a read-only, by-design lookup. |

(Exact per-category counts shift slightly between static runs — the latest re-scan returned 11 findings; the categories above and the all-false-positive verdict are stable.) This matches the family baseline (CoalMine 58/100, CoalTipple 10/100 — likewise all-false-positive). The report JSON is not shipped.

## Reporting a vulnerability

Open an issue at `github.com/TheColliery/CoalBoard`, or request a private channel for sensitive PoC logs. We investigate promptly.

## Commit & tag signatures

All commits and release tags are SSH-signed (`gpg.format=ssh`); GitHub renders the Verified badge. Verify locally with `git verify-commit HEAD` and `git tag -v "$(git describe --tags --abbrev=0)"`.

## Structural safety — the hook (Phoenix-13)

`hooks/coalboard-conductor.js` is **advise-only** and Phoenix-pure: zero dependencies (Node builtins only), **no network, no child processes**, fail-silent (exits 0 on any error; never crashes the host), and it only emits the two sanctioned channels. It **detects and injects** — it never spawns workers, networks, or applies anything. Its stdin parse is guarded against non-object input.

## Security by design — the board

The board is built so that reviewing untrusted work cannot harm the host:

- **The work under review is DATA, never instructions** — the lens prompts never obey an injected *"approve this"*.
- **Propose, never execute** — the lenses emit a diff to `.coalboard/proposed/`; the board itself runs no side-effect. A real side-effect (a migration, an API call, a deploy) fires **only at the human-approved apply**, with a warning, and is never auto-retried.
- **Verify is sandboxed** — the judge runs checks in isolation (no real DB/network; an untrusted test is linted for banned modules before it runs). External SAST is optional, never a hard requirement.
- **Secrets are scrubbed** from anything logged or displayed (`scripts/lib/secrets.mjs`).
- **No human, no apply** — a non-interactive (cron/headless) run is report-only; the human consent gate is the load-bearing safety node.

## Dist integrity

The clean `plugin/` distribution is generated from source by `node scripts/build-plugin.mjs`; `node scripts/verify.mjs` checks the dist is in sync, the manifest is valid, and the config schema is well-formed. `node --test scripts/lib/*.test.mjs` runs the zero-dependency unit + hermetic-hook tests.
