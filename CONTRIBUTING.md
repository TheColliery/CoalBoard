# Contributing to CoalBoard

CoalBoard is the consensus & debate board of the [TheColliery](https://github.com/TheColliery) series. We welcome issues, bug reports, and pull requests.

---

## 🤝 Proposing a Change

1. **Open an issue first** describing the problem, gap, or proposed feature (especially for changes to `SKILL.md` — the board contract).
2. Make your code changes and keep the verification gates green.
3. For board-behavior or `SKILL.md` changes, **dogfood it live** (convene the board on a real task across at least one platform) and document the behavior in your PR.

---

## 💻 Developing & Testing

CoalBoard is **zero-dependency** (Node.js built-ins only, Node 18+). No `npm install` is required.

Keep the gates green before and after editing:

```bash
node scripts/verify.mjs   # validates the config schema, the manifest, the factory config, and plugin/ dist-sync
node scripts/test.mjs     # runs the zero-dependency test suite (node --test)
```

### Development Rules
* **Rebuild the dist after a source change:** edit `skills/`, `hooks/`, `commands/`, `scripts/lib/`, or the manifest, then `node scripts/build-plugin.mjs` to re-sync `plugin/` (verify fails on a stale dist).
* **`config-schema.mjs` is the single source of truth** for every `.coalboard.json` key — `verify.mjs` validates the factory config against it.
* **Keep the conductor Phoenix-pure:** zero dependencies, fail-silent (wrap in try/catch, never exit non-zero), no network, no spawn, no NUL byte.
* **Add unit tests:** every shared helper gets a `*.test.mjs`; the conductor change gets a hermetic spawn test. Register new files in `scripts/test.mjs` (the runner fails on an unlisted orphan).
* **Language & tone:** shipped source and docs stay in English.

---

## 🖥️ Supported Platforms

CoalBoard is **cross-agent** — it runs on any platform with concurrent subagents (the board spawns parallel-blind lenses; diversity rides the prompts, not a vendor). **Claude Code** additionally lets it run cheap lenses + a premium judge (a cost bonus) and auto-activates via hooks. A platform with no concurrent fan-out degrades to a sequential pass or off — never a broken board. Verify the platform's current subagent support (it churns).

---

## 🗂️ Project Layout

| Path | Purpose |
|---|---|
| `skills/coalboard/SKILL.md` | The board contract (the load-bearing prompt). |
| `scripts/lib/` | Core logic: `config-schema`, `trigger` (AND-gate), `rigor` (preset), `secrets` (scrubber). |
| `scripts/` | Tool scripts: `build-plugin.mjs`, `verify.mjs`, `test.mjs`. |
| `hooks/coalboard-conductor.js` | Phoenix-pure conductor hook (SessionStart + UserPromptSubmit). Auto-synced by the build. |
| `plugin/` | Generated Claude Code plugin distribution. |
| `platform-configs/.coalboard.json` | Commented factory default configuration. |
| `eval/` | The with-the-board-vs-without benchmark (method + per-task scoring). |

---

## 🚀 Releasing (Maintainers)

Bump version in `.claude-plugin/plugin.json` ➡️ add a `CHANGELOG.md` entry ➡️ ensure `verify.mjs` and `test.mjs` pass ➡️ commit ➡️ create a signed git tag (`vX.Y.Z`) ➡️ push ➡️ create a GitHub Release (stable tags only).

---

## 📄 License & Conduct

Contributions are licensed under the [MIT License](LICENSE). Please assume good faith and be respectful. Report security issues per [SECURITY.md](SECURITY.md).
