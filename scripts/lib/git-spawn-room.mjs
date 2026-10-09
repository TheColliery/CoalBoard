// The room's half of the canon git-spawn census (09a). scripts/lib/git-env-census.mjs (+ .vectors.mjs, .test.mjs) is the CANON, adopted by blob id from
// .github templates/overlay-coal-skill/ and never edited here: it holds the rule, the lexer and the 188-row witness list. This room adds only what the canon cannot
// know: WHICH files it reads (scripts/**/*.mjs through the canon walk, plus hooks/*.js, a wider census than the canon's, a named divergence) and the PINS.
//
// A pin is { rel, blob, why }: the census skips that file only while its git blob id equals `blob`, so the first edited byte (or a re-sync of the source it copies)
// re-arms the census on it, and git-spawn-room.test.mjs fails a pin that matches no bytes and a pin whose file passes without it. Each file below is a byte-equal copy
// of an org template (SERIES-CANON "Secret scan": scanner parity measures it), so the room cannot route its git spawns through gitEnv() without breaking that parity;
// the real fix belongs to the canon (the .github deputy). Why each stays, quoted from the canon census run with no pin (09b: the scanner test left the list, the Bankfire source's
// bd328f2 copy a0319dcd reads a checked env; the secret gate is the one carrier the census still refuses unpinned, re-measured 2026-10-09 against canon 13f8d95c):
import fs from 'node:fs';
import path from 'node:path';
import { collectScriptsMjs, scanGitSpawns } from './git-env-census.mjs';

export const PINS = [
  {
    rel: 'scripts/secret-gate.mjs',
    blob: '856956a1cca6f716e5507f6c23ac90ed34cbbe5f',
    why: 'canon published-code secret gate, byte-equal: its own gitEnv is an Object.entries(process.env) filter that strips GIT_* (a denylist) and keeps GIT_INDEX_FILE for the gate\'s two real-repo reads on purpose, so the census finds "env: holds process.env without gitEnv()" at both spawns and the name cannot vouch for it (F42).',
  },
];

// scripts/**/*.mjs by the canon's own walk, plus hooks/*.js (the conductor is a CJS file that could spawn git).
export function roomSources(repo) {
  const files = collectScriptsMjs(repo);
  const hooksDir = path.join(repo, 'hooks');
  if (fs.existsSync(hooksDir)) {
    for (const n of fs.readdirSync(hooksDir).filter((x) => x.endsWith('.js')).sort()) {
      files.push({ rel: `hooks/${n}`, text: fs.readFileSync(path.join(hooksDir, n), 'utf8') });
    }
  }
  return files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

export function roomCensus(repo) {
  return scanGitSpawns(roomSources(repo), PINS);
}
