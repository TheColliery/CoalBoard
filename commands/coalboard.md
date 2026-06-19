---
description: Convene the CoalBoard consensus & debate board on the current (or named) task — for error-not-allowed work, with consent.
---

Manually convene **CoalBoard** for the current or named task. Follow `skills/coalboard/SKILL.md` exactly:

1. **Gate it.** A manual convene is **not limited to error-not-allowed** — confirm the task is *worth a board*: a genuinely hard / high-stakes problem where several diverse perspectives add real value (error-not-allowed is the headline case — security/crypto, a DB/financial migration, high-precision math — but also a thorny design decision, a high-stakes review, a hard non-code judgment). DECLINE only if it is ROUTINE/trivial — a board is several agents, not for ordinary work.
2. **Consent.** Show the user the risk reason + an estimated token cost + the model tiers, then convene only on approval (or when `coalboardMode` is `auto`). Use the platform's question-box.
3. **Run the board** (Steps 1–4): spawn the lenses in PARALLEL (blind, spec-only) → judge on VERIFIED inputs → summon the out-of-frame sub4 on deadlock → stage to `.coalboard/proposed/` → verify (sandboxed, you run it) → present a DIGESTIBLE consent (disagreements + failed show-me demands + diff) → apply only on approval. Warn loudly about any side-effect.

Audit mode: to scrutinize EXISTING work instead of generating, point the lenses at the changed/specified files and debate the findings.
