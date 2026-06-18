---
description: Convene the CoalBoard consensus & debate board on the current (or named) task — for error-not-allowed work, with consent.
---

Manually convene **CoalBoard** for the current or named task. Follow `skills/coalboard/SKILL.md` exactly:

1. **Gate it.** Confirm the task is genuinely *error-not-allowed* (security/crypto, a DB/financial migration, high-precision math, or any catastrophic-on-error change). If it is routine, say so and DECLINE — the board is not for ordinary work (it is off ~90% of the time on purpose).
2. **Consent.** Show the user the risk reason + an estimated token cost + the model tiers, then convene only on approval (or when `coalboardMode` is `auto`). Use the platform's question-box.
3. **Run the board** (Steps 1–4): spawn the lenses in PARALLEL (blind, spec-only) → judge on VERIFIED inputs → summon the out-of-frame sub4 on deadlock → stage to `.coalboard/proposed/` → verify (sandboxed, you run it) → present a DIGESTIBLE consent (disagreements + failed show-me demands + diff) → apply only on approval. Warn loudly about any side-effect.

Audit mode: to scrutinize EXISTING work instead of generating, point the lenses at the changed/specified files and debate the findings.
