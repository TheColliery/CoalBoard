// 29bo (CWK3-001): the plugin folder's README. plugin/README.md is the dist copy of plugin-src/README.md; this module owns the map, the
// word floor and the checks. Node builtins only (Phoenix #2). verify.mjs and build-plugin.mjs both import it, and it imports only dist-compare.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { filesEqual } from './dist-compare.mjs';

// Source and destination pairs. The src is POSIX-separated and is joined with path.join at each use.
export const DIST_DOCS = [{ src: 'plugin-src/README.md', dst: 'README.md' }];

// The directory minimum for a plugin README, counted outside fenced code blocks. A placeholder signal, not a quality bar.
export const DOC_MIN_WORDS = 40;

// Words outside fenced code blocks. A fence opens on three or more backticks or tildes, and closes only on a line of the same kind that is at least
// as long as the opener and holds nothing else (the CommonMark rule), so a nested shorter fence or an info-string line does not end it. A fence that
// never closes is code to the end of the file, so an open fence never inflates the count.
export function docWords(text) {
  let fence = null;
  const prose = [];
  for (const line of text.split(/\r?\n/)) {
    if (fence === null) {
      const open = /^\s*(`{3,}|~{3,})/.exec(line);
      if (open) fence = open[1];
      else prose.push(line);
      continue;
    }
    const close = line.trim();
    if (/^(`{3,}|~{3,})$/.test(close) && close[0] === fence[0] && close.length >= fence.length) fence = null;
  }
  return prose.join(' ').split(/\s+/).filter(Boolean).length;
}

// The source a dist README is built from, or null for any other dist path.
export function distDocSource(dst) {
  const entry = DIST_DOCS.find((d) => d.dst === dst);
  return entry ? entry.src : null;
}

// The read errors that mean "no file here": a missing path, a path through a file, or a directory where a file belongs. Any other read error is a fault and stays loud.
const NOT_A_FILE = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

// Findings as strings (empty when clean). Each file is read once, inside a try, rather than checked first (CodeQL js/file-system-race, alert #13): a path that
// vanishes or turns into a directory between a check and a read would otherwise throw out of the gate. A source that vanishes between its two reads is
// reported against the dist; the gate fails either way. `read` is injectable for the tests only.
export function checkDistDocs(distRoot, srcRoot, { read = fs.readFileSync } = {}) {
  const findings = [];
  for (const { src, dst } of DIST_DOCS) {
    const srcAbs = path.join(srcRoot, ...src.split('/'));
    const dstAbs = path.join(distRoot, dst);
    let text;
    try { text = read(srcAbs, 'utf8'); } catch (e) {
      if (!NOT_A_FILE.has(e.code)) throw e;
      findings.push(`${src} is missing; the plugin README has no source`);
      continue;
    }
    const n = docWords(text);
    if (n < DOC_MIN_WORDS) findings.push(`${src} has ${n} words outside code blocks; the directory minimum is ${DOC_MIN_WORDS}`);
    try {
      if (!filesEqual(srcAbs, dstAbs)) findings.push(`plugin/${dst} is stale vs ${src}; run scripts/build-plugin.mjs`);
    } catch (e) {
      if (!NOT_A_FILE.has(e.code)) throw e;
      findings.push(`plugin/${dst} is missing; run scripts/build-plugin.mjs`);
    }
  }
  return findings;
}
