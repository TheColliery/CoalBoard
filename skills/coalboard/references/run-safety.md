# CoalBoard — RUN SAFETY: what a run is allowed to leave behind (CWK-160)

The board's seats RUN things (`feeling` and `adversary` hold a shell; main runs Step 2's checks and Step 4.2's gates). A run is how a claim is proven, so the run STAYS. What changes is that every run is surveyed first and compared after. The reason is measured: a seat ran a tool on a COPY with a sandboxed `HOME`, and the tool still walked up out of the copy and rewrote the owner's real global config, because a faked `HOME` defeats a guard that compares against the home directory.

**Every actor that runs a command against a target is bound by S1, S2, S3 and S5 below, and by S4 only where a real box exists.** Actors: `main` (Step 2 and Step 4.2 runs), `feeling`, `adversary`. A seat that cannot do S1 and S2 does not run: the dimension it would have run is NOT-CHECKED (never clean).

## The safeguard ledger — S1-S5 (TRANSCRIBE; the proof column is what the return states)

| id | safeguard | binds | the return states |
|---|---|---|---|
| **S1 SURVEY** | BEFORE the run, read what the tool does: what it reads and writes, whether it walks UP directories, which env vars it trusts. List the REAL files inside its reach (the user's global configs under the home directory, every ancestor of the working directory up to the drive root, the repo itself). Record each one's mtime and SHA-256. A lint of the command line alone does not replace this | main · feeling · adversary | the list of real paths in reach and their recorded hashes |
| **S2 BACK UP · RUN · COMPARE · RESTORE** | Copy the S1 files to a backup the run cannot reach, RUN, then compare mtime and SHA-256 again. Any difference: RESTORE the file from the backup and report it as a FINDING (the tool touched what it should not), so a slip is undone, not only noticed. No change: say `no real file changed` | main · feeling · adversary | `compared N files: changed M`, each change named and `restored` |
| **S3 CLONE OUTSIDE THE HOME TREE** | Work on a COPY of the target. Put the copy in a lab directory OUTSIDE the home tree where the platform allows (on Windows `%TEMP%` and the session scratchpad sit inside the profile, so use a directory off the drive root; on POSIX a `mktemp -d` under `/tmp`). Never in the session scratchpad. If the platform allows no such place, say so and let S2 carry the weight | main · feeling · adversary | the clone's real path and that it is outside the home tree (or why it could not be) |
| **S4 THE BOX** (OPTIONAL) | A real isolation box (a WSL distro with the Windows drive not mounted, Windows Sandbox, a container with no bind of the home) is an ENHANCEMENT found by a capability PROBE, never a requirement: not every user has one. The probe's question is the property, never a platform name: from INSIDE the box, is the real home unreachable? Yes: run in it and say which box. No box, or the probe says the home is reachable: S1-S3 only, said in one line | main · feeling · adversary | the probe's command and answer, or `no box found` |
| **S5 CLEANUP** | When the mission ends, remove the clone with a NARROW delete: exactly the directory this run created, its real path asserted under the lab root BEFORE the delete in the same script. Never a glob, a home or profile directory, a drive root, a repository root, or a path built from a variable the script has not checked. Confirm it is gone | main · feeling · adversary | `clone removed` (or the refusal and why) |

## The two nevers

| id | never |
|---|---|
| **N1** | **Never fake isolation with an environment variable** (`HOME`, `USERPROFILE`, `TEMP`, `TMPDIR` pointed elsewhere). It is not a box: the tool still reaches the real files and a home-comparing guard stops working. |
| **N2** | **`HOME` stays real unless a real box (S4) is in use.** The protection on a box with no isolation tool is S1-S3, never a pretended home. |

## Probing for a box (S4) — the property, not the platform

Run the probe from a script file, never an inline quoted shell string. A box exists only when the probe shows the real home is NOT reachable from inside it. For a WSL distro ask BOTH ways out, because closing one leaves the other: (1) do the Windows drives reach the real profile? (WSL mounts them under `/mnt` by default; with `[automount] enabled=false` a drive can still be mounted manually or through fstab, and mounting from fstab is on by default), and (2) can a Windows process be launched from inside? (`[interop] enabled` defaults to true, and a launched Windows process reaches the real profile whatever `/mnt` shows). Source: Microsoft Learn, the wsl.conf page (https://learn.microsoft.com/en-us/windows/wsl/wsl-config), read 2026-10-03. The property is the question; no probe command is fixed here. ⚠️ unverified: any concrete probe command: re-check it against the platform's own documentation before relying on one, and treat a probe that errors as `no box found`, never as a box.

## How this binds the seats

`references/lens-prompts.md` carries the S1-S5 rule in every Bash-holding seat's FIXED rules, so the seat's own prompt states it. SKILL.md Step 4.2's isolation line names this ledger for main's runs. The seats' tool rights do NOT change (Seat permissions is untouched): this adds a duty to a run, never a right.

**Grant vs guarantee:** these are rails a model follows, enforced below probability 1 like every prose rail (hooks-safety.md section 9). S2's compare is what turns a slip into a finding even when a rail was missed, which is why the baseline is a compare-and-restore and not an instruction to be careful.
