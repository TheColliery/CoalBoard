// CWK-133 / C-4 -- the ONE place this room builds an environment for a `git` child.
//
// THE HAZARD: inside a LINKED worktree a git hook exports an ABSOLUTE `GIT_DIR` (and
// `GIT_INDEX_FILE`). Both OVERRIDE `cwd` and `GIT_CEILING_DIRECTORIES`, so a fixture's `git init`
// lands on the REAL enclosing repository instead of the sandbox it was aimed at (CoalFace measured
// core.bare = true on its own repo for ~2 minutes, 2026-09-23). The gates here run under
// .githooks/pre-commit, so they are in exactly that position.
//
// THE CLASS FIX: delete every key matching ^GIT_ from a COPY of the environment -- the whole
// family, never a hand list, so a git that grows a new GIT_* variable is covered the day it ships
// -- then set GIT_CEILING_DIRECTORIES so a child that fails to find its own .git can never climb
// into a parent repository. The ceiling is OPTIONAL: a caller that does not know its root
// (link-check.mjs runs from whatever directory the user is in) passes nothing, and an ambient
// ceiling the user set survives -- a ceiling never redirects git, so it is the guard, not the hazard.
//
// Zero-dep, node builtins only, never mutates process.env. Named `gitEnv` to match CoalTipple,
// CoalHearth and CoalWash (one flock, one color); CoalFace's twin is `gitTestEnv`.
export function gitEnv(ceilingDir) {
  const ambientCeiling = process.env.GIT_CEILING_DIRECTORIES;
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^git_/i.test(key)) delete env[key]; // case-insensitive: a Windows env is, and git reads it that way
  }
  const ceiling = ceilingDir !== undefined ? ceilingDir : ambientCeiling;
  if (ceiling !== undefined) env.GIT_CEILING_DIRECTORIES = ceiling;
  return env;
}
