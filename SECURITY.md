# Verifying CoalBoard

CoalBoard is verified under the same framework as **[CoalMine](https://github.com/HetCreep/CoalMine)** and **[CoalTipple](https://github.com/TheColliery/CoalTipple)**: the execution hook follows the [Phoenix-13 commandments](https://github.com/TheColliery/.github/blob/main/hooks-safety.md), the build is reproducible from source, and the design is security-first.

> **Beta note (`v0.1.0-beta.1`):** the primary assurance below is **structural**. An independent NVIDIA SkillSpector scan has **not** been run on this beta yet — it will be run and its provenance recorded here before the first stable (`1.0`) release. We do not claim a scan that has not happened.

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
