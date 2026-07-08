---
description: CoalBoard session stats — boards convened, lenses spawned, verdicts, and staged/applied activity this session
---

Produce the CoalBoard stats report for this session, in the user's language (translate prose, keep technical terms verbatim). Tables only, minimal prose. If no board convened this session, say so plainly as the whole report — do not stretch unrelated activity to fill it.

Drawn from the conversation context, show:
- **Boards convened:** count, each tagged auto (conductor signal / CoalTipple hand-off) or manual (`/coalboard`), with its `rigor` preset.
- **Lenses spawned:** which (`data`/`truth`/`feeling`/adversary/sub4) and the model tier each ran at.
- **Verdicts:** findings CONFIRMED vs REFUTED by the judge, and any sub4 tie-break outcome.
- **Staged vs applied:** changes written to `.coalboard/proposed/` vs approved to live, and any report-only / stop outcomes.
- **Approximate token spend:** an estimate only — there is no cost API, so label it clearly as approximate.

This is the `/coalboard stats` action exposed as a discoverable command. Do not modify any file.
