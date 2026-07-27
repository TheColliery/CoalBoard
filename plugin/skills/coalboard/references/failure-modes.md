# CoalBoard — failure modes, limits & recovery mechanics

> Loaded ON-DEMAND when a lens misbehaves (spawned a grandchild), a lens/session flattens or dies, or a run must resume after a budget/limit hit. The RAILS live in `SKILL.md` (Step 1 Bounds · Memory & resume); this reference holds the war-stories + deep mechanics that PROVE why those rails are structural, not prose.

## Why LEAF is enforced STRUCTURALLY, not by prose (issue #2)
A prose-only LEAF rule FAILED live: an opus show-me lens spawned a background subagent → an orphan GRANDCHILD that, once the lens RETURNED, was UNREAPABLE by main (main holds no handle; `TaskStop`/`TaskList` find nothing — only the now-gone parent could reap it) → a ~27-min / ~213k-token runaway. PREVENT the grandchild structurally (spawn every lens WITHOUT the spawn tool — SKILL.md Step 1 ENFORCE STRUCTURALLY); do NOT rely on reaping it (on CC you cannot). The Backstop rail (main surfaces + stops any lens whose returned text REPORTS it spawned a subagent) exists because a slipped grandchild is the one escape from the no-zombie guarantee.

## The flatten limit — why main cannot reap a deep lens (HONEST CC LIMIT, proven live)
A depth-≥2 lens FLATTENS into an independent TOP-LEVEL session main holds no handle to (same reason as the grandchild above) → main can neither SEE nor REAP it; the "confirm all terminated" barrier is then BEST-EFFORT agentId-reconciliation, NOT an enforced reap, and only the HUMAN's top-level UI (Clear) reaps it — so the end-of-run report tells the user to Clear lingering lens sessions (Step 4). Do NOT attest a reap the board cannot perform. Near a budget/quota limit, collapse to fewer workers or inline-self rather than fan out — a board that dies on the limit returns nothing.

## Why the Step-1 blind/read-once rails are structural (carved from SKILL.md — rails unchanged there)
- **Blind** = the INDEPENDENCE that makes diverse lenses beat one voice: a lens that sees another's output ANCHORS on it (echo chamber) — sequential or shared-output boards correlate the very voices the board exists to decorrelate. The same loss shape as a scope split among lenses: a split = parallel solos, forfeiting the decorrelation that IS the board's value.
- **Cache-shaping's why:** the prefix cache is per-lens — N blind lenses each re-reading `{target}` fresh pay the full input cost N times over; main reading ONCE and EMBEDDING pays it once.

## Why sub4's ruling stands without an extra gate (carved from SKILL.md Step 3)
- sub4 solves blind because a reviewer who SEES the answers is back in the frame — no longer out-of-frame.
- A sub4-matched camp wins WITHOUT an extra blocking gate because an ordinary user can't adjudicate a deep technical deadlock — sub4 is the best blind out-of-frame machine call available; the human gate still owns the APPLY.

## Sub resume — the SendMessage-absent mechanics (why remainder-re-spawn is PRIMARY)
⚠️ VERIFIED — the standard CC session has NO callable SendMessage tool (the Agent result DANGLES a `use SendMessage with to: '<agentId>'` handle, but no tool acts on it here); `TaskStop` IS available (main can reap a runaway / zombie / hung sub). That is WHY re-spawning a FRESH lens on the journal-tracked UN-DONE REMAINDER is the PRIMARY, actuatable warm-resume, and SendMessage-resume the dead `agentId` is a BONUS only where the tool is actually present (FleetView / other modes; ABSENT in CB's own standard session, so never depend on it). Budget returns via the quota reset OR a user REFILL/upgrade at ANY time — which is why resume triggers on BUDGET-RETURN, not a fixed clock. ⚠️ VERIFY at build that SendMessage-resume restores context across a session-limit reset; degrade to remainder-re-spawn if not.
