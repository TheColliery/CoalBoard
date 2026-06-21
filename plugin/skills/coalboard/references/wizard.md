# CoalBoard — the manual `/coalboard` setup wizard

## LAYMAN-DEFAULT — the AI handles everything (the default path)
1. **TARGET:** a path/cwd given → use it; else ONE plain question ("what should I check?" — cwd ✓ · a folder · the clean mirror).
2. **Scan silently** (enumerate-only + the exclude-floor below) → SAFE defaults: work-type from the scan · depth L2 · rigor standard · dispatch all-at-once.
3. **ONE plain bill = the only question:** "I'll have 3 independent reviewers + a judge check [target] ([N] files) — about [Y] tokens. [Go ✓ · cheaper · more thorough · cancel]". NO opaque jargon (cheaper/more-thorough map to depth/rigor silently).
4. On Go → convene. (Safety = SKILL.md Step 4 staging + human-apply gate.)
- **Layman honesty (NEVER false confidence):** the result says what it checked + RAN + found AND what it could NOT verify, plus "for anything irreversible (money / security / data-loss) get a human / second opinion" — NEVER "trust me".

## PROGRAMMER — full control (opt-in: "advanced" / stating prefs / config), the restaurant flow
**order → bill → pay = 3 boxes** — the bill is computed AFTER the picks, so the post-pick confirm is its OWN box, NEVER folded into the settings box.
- **Call 1 — TARGET (asked FIRST, before any scan):** cwd ✓ · clean mirror (`Colliery/`) · subproject · path · diff · configured. Then read VERSION from the target's OWN files; note SOURCE vs install-clone (sets report location — `audit.md`).
- **Scan (silent · enumerate-only · ONE line):** classify by extension/path, NO content read. EXCLUDE = `excludePaths` (config) ∪ the dev-contamination floor (`CLAUDE.md`/`MEMORY.md`/`AGENTS.md`/`.claude/`/`.agents/`); `.github`/`workflows/` stay IN-scope (`audit.md`). FRESH (no prior-`audit-*.md` read). Surface: `Scanned: N files · class · source|clone · report→path · prior-audit?`.
- **Call 2 — the 3 settings (batched):** WORK-TYPE (scan-derived · ASK — the only scope-narrowing) · DEPTH (L1 · L2 ✓ · L3 ~3-4×) · RIGOR (relaxed · standard ✓ · high · nasa; per-instance, never written to config).
- **Bill → Call 3 — confirm:** compute the cost FROM the picks → show the bill (target · N files · resolved config · model-per-lens · ~cost) → ONE question: confirm ✓ · change · cancel. Spawn the first lens ONLY on confirm. DISPATCH defaults all-at-once (config-overridable; ask only if raised). Boarding-scope per `audit.md`.

## Convene
Substitute the resolved values into `references/lens-prompts.md` (it owns the fill rules); model = `rigorLensTiers` (SKILL.md Step 1). Convene (SKILL.md Steps 1–4).
