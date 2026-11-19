// The room's half of the canon git-spawn census (09a). scripts/lib/git-env-census.mjs (+ .vectors.mjs, .test.mjs) is the CANON, adopted by blob id from
// .github templates/overlay-coal-skill/ and never edited here: it holds the rule, the lexer and the witness list. This room adds only what the canon cannot
// know: WHICH files it reads (scripts/**/*.mjs through the canon walk, plus hooks/*.js, a wider census than the canon's, a named divergence) and the PINS.
//
// A pin is { rel, blob, why }: the census skips that file only while its git blob id equals `blob`, so the first edited byte (or a re-sync of the source it copies)
// re-arms the census on it, and git-spawn-room.test.mjs fails a pin that matches no bytes and a pin whose file passes without it. Each file below is a byte-equal copy
// of an org template (SERIES-CANON "Secret scan": scanner parity measures it), so the room cannot route its git spawns through gitEnv() without breaking that parity;
// the real fix belongs to the canon (the .github deputy). Why each stays, quoted from the canon census run with no pin (the secret gate is the one carrier the census still refuses unpinned: re-measured 2026-11-19 against canon .github 90c1933 (blob 2800aab98129), the unpinned census finds 1 hit, scripts/secret-gate.mjs:66, "env: holds process.env without gitEnv()"; the count was taken in a scratch copy with PINS emptied):
import fs from 'node:fs';
import path from 'node:path';
import { collectScriptsMjs, scanGitSpawns } from './git-env-census.mjs';

export const PINS = [
  {
    rel: 'scripts/secret-gate.mjs',
    blob: '2800aab9812999c8e4378164aaf0af7ebf1b119a',
    why: 'canon published-code secret gate, byte-equal: its own gitEnv is an Object.entries(process.env) filter that strips GIT_* (a denylist) and keeps GIT_INDEX_FILE and GIT_CEILING_DIRECTORIES for the gate\'s two real-repo reads on purpose, so the census finds "env: holds process.env without gitEnv()" at secret-gate.mjs:66, one of its two git spawn sites (:66 and :108; the census flags only :66; measured 2026-11-19 at canon 90c1933), and the name cannot vouch for it (F42).',
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
