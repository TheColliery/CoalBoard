#!/usr/bin/env node
// r34 CW-017. Repo-internal link/anchor gate, built against CWK-098's MEASURED slug
// oracle (scratchpad/r34/ref/slug-oracle-2026-09.md -- GitHub's own POST /markdown
// render, 998/998 anchors reproduced). Zero-dep, node builtins only.
//
// Exported pure pieces: slug, renderInline, anchorsFor, checkFile, Anchorer -- tests
// import these directly. `main()` is guarded so importing this file never runs the CLI.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// step 2 keep-set, exactly as THE RULE states it: \p{Alphabetic} | \p{M} | \p{Nd} |
// \p{Pc} | \p{Join_Control} | U+0020 SPACE | U+002D HYPHEN-MINUS. Everything else is
// dropped -- including `<` and `>`, which is why the tag-strip in renderInline() below
// needs no fixed-point loop (see the comment on that line).
const DROP = /[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control} -]/gu;

export function slug(text) {
  let s = '';
  for (const ch of String(text)) s += ch.toLowerCase(); // per code point: no final-sigma context
  return s.replace(DROP, '').replace(/ /g, '-'); // each SPACE -> one hyphen; no collapse, no trim
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === '#') {
      const isHex = e[1] === 'x' || e[1] === 'X';
      const code = isHex ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // Number.isFinite alone accepts a value above 0x10FFFF; String.fromCodePoint throws
      // RangeError for such a value, and that exception escapes checkFile/main, so a heading
      // like "# &#1114112; note" crashed the whole CLI with a stack trace instead of reporting
      // a finding. CodeRabbit PR 19 comment 4045387921.
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const key = e.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
  });
}

// Step 0 -- resolve inline markup on a raw heading source, per THE RULE's own list
// (code spans literal, link/image text kept, HTML tags removed, backslash escapes
// resolved, entities decoded, emphasis delimiters removed). Best-effort, the same
// scope the record itself states: no autolinks, no reference-style links, no nested
// brackets, no multi-backtick code spans holding backticks.
export function renderInline(raw) {
  const BACKTICK = String.fromCharCode(96);
  const codeSpanRe = new RegExp(`(${BACKTICK}+)([\\s\\S]*?[^${BACKTICK}])\\1(?!${BACKTICK})`, 'g');
  const parts = [];
  let last = 0;
  let m;
  while ((m = codeSpanRe.exec(raw))) {
    parts.push({ code: false, t: raw.slice(last, m.index) });
    let body = m[2];
    if (/^ .* $/.test(body) && body.trim() !== '') body = body.slice(1, -1);
    parts.push({ code: true, t: body });
    last = m.index + m[0].length;
  }
  parts.push({ code: false, t: raw.slice(last) });
  return parts
    .map((p) => {
      if (p.code) return p.t;
      let t = p.t;
      t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'); // link / image -> its text
      // CodeQL js/incomplete-multi-character-sanitization would flag this single pass
      // if a re-formed tag (`<<a>b>` -> `<b>`) could survive downstream. It cannot:
      // renderInline()'s only callers are slug()-via-anchorsFor()/checkFile() and this
      // file's own tests, and slug()'s DROP filter above strips every remaining `<`/`>`
      // unconditionally (neither is Alphabetic/Mark/Decimal/Connector/Join_Control) --
      // so no output of this function ever reaches a Set key with `<`/`>` intact,
      // regardless of what a single tag-strip pass leaves behind. Pinned by a red-first
      // test in link-check.test.mjs (mutate DROP to permit `<>`, watch it fail).
      t = t.replace(/<\/?[A-Za-z][^>]*>/g, '');
      t = t.replace(/\\([!-/:-@[-`{-~])/g, (_x, ch) => '\u0000' + ch); // protect escaped ASCII punctuation
      // underscore emphasis: a run of _ that opens (not preceded by a word char) and a
      // matching run that closes (not followed by one); intraword _ stays literal (GFM).
      t = t.replace(/(^|[^\p{L}\p{N}_\u0000])(_+)(?=\S)([\s\S]*?\S)\2(?![\p{L}\p{N}_])/gu, '$1$3');
      t = t.replace(/(^|[^*\u0000])(\*+)(?=\S)([\s\S]*?\S)\2/g, '$1$3');
      t = t.replace(/\u0000/g, '');
      return decodeEntities(t);
    })
    .join('');
}

// github-slugger occurrence counter: every emitted anchor is registered, so a literal
// "x-1" heading after two "x" headings becomes "x-1-1".
export class Anchorer {
  constructor() {
    this.occ = new Map();
  }
  anchor(base) {
    let result = base;
    while (this.occ.has(result)) {
      this.occ.set(base, (this.occ.get(base) ?? 0) + 1);
      result = `${base}-${this.occ.get(base)}`;
    }
    this.occ.set(result, 0);
    return result;
  }
}

// CommonMark 4.5 fenced code blocks: a line of 3+ backticks or tildes (<=3 leading
// spaces) opens a fence; only a line of the SAME character, at least as long, with
// nothing else on it, closes it. Every line strictly between is content; the opening
// and closing fence lines themselves are excluded from heading/link scanning too.
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let fenceChar = null;
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceChar) {
      mask[i] = true;
      const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      mask[i] = true;
      fenceChar = open[1][0];
      fenceLen = open[1].length;
    }
  }
  return mask;
}

// ATX headings only (H1-H6), fenced lines excluded. Requires a space/tab (or nothing)
// after the opening #s, per CommonMark -- `#heading` with no space is not a heading.
function walkHeadings(source) {
  const lines = source.split(/\r\n|\n|\r/);
  const mask = fenceMask(lines);
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?[ \t]*$/.exec(lines[i]);
    if (!m) continue;
    let text = m[2] ?? '';
    text = text.replace(/[ \t]+#+[ \t]*$/, ''); // strip a space-preceded closing #-run
    headings.push({ line: i + 1, text });
  }
  return headings;
}

// The anchor set for one document, computed with THE RULE (occurrence counter per
// document, fenced lines excluded).
export function anchorsFor(source) {
  const ancr = new Anchorer();
  const anchors = new Set();
  for (const h of walkHeadings(source)) {
    anchors.add(ancr.anchor(slug(renderInline(h.text))));
  }
  return anchors;
}

const LINK_RE = /!?\[([^\]]*)\]\(([^)\s]+)(?:[ \t]+"[^"]*")?\)/g;
const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // a scheme: or a protocol-relative //

// Every markdown link/image target in ONE file, outside fenced code. A relative file
// target must exist on disk; a #anchor (own file or file.md#anchor) must be in that
// document's anchor set. External (any scheme:, incl. http(s)/mailto) is out of scope.
export function checkFile(relPath, repoRoot, anchorCache = new Map()) {
  const absPath = path.resolve(repoRoot, relPath);
  let source;
  try {
    source = readFileSync(absPath, 'utf8');
  } catch (err) {
    return [{ file: relPath, line: 0, target: '', reason: `cannot read file (${err.code || err.message})` }];
  }
  const findings = [];
  const lines = source.split(/\r\n|\n|\r/);
  const mask = fenceMask(lines);
  const dir = path.dirname(absPath);
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(lines[i]))) {
      const target = m[2];
      if (EXTERNAL_RE.test(target)) continue;
      const hashIdx = target.indexOf('#');
      const filePart = hashIdx === -1 ? target : target.slice(0, hashIdx);
      const rawAnchor = hashIdx === -1 ? null : target.slice(hashIdx + 1);
      let targetAbs = absPath;
      if (filePart) {
        targetAbs = path.resolve(dir, filePart);
        if (!existsSync(targetAbs)) {
          findings.push({ file: relPath, line: i + 1, target, reason: 'file target does not exist' });
          continue;
        }
      }
      if (rawAnchor === null) continue;
      let anchor;
      try {
        anchor = decodeURIComponent(rawAnchor);
      } catch {
        findings.push({ file: relPath, line: i + 1, target, reason: 'malformed percent-encoding in anchor' });
        continue;
      }
      let anchors = anchorCache.get(targetAbs);
      if (!anchors) {
        let targetSource;
        try {
          targetSource = readFileSync(targetAbs, 'utf8');
        } catch {
          targetSource = '';
        }
        anchors = anchorsFor(targetSource);
        anchorCache.set(targetAbs, anchors);
      }
      if (!anchors.has(anchor)) {
        findings.push({ file: relPath, line: i + 1, target, reason: 'anchor not found' });
      }
    }
  }
  return findings;
}

// Excluded from the WALK (never from a direct check): the generated dist copy, and
// this engine's own planted-defect fixtures (they carry intentional broken links the
// unit tests assert against -- scanning them here would fail this gate by design).
function isExcluded(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  return norm.startsWith('plugin/') || norm.includes('/fixtures/link-check/');
}

// A git pre-commit/pre-push hook sets GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE for its own
// child processes -- .githooks/pre-commit runs "node scripts/test.mjs" as a hook, so this
// is a real caller shape, not a hypothetical one. Any of the three OVERRIDES cwd for repo
// discovery, so "git ls-files" would enumerate the HOOK's repository instead of repoRoot.
// Scrubbed here so the scan always targets the directory it was actually asked to scan.
// CodeRabbit PR 19 comment 4045387940.
const GIT_ENV_SCRUBBED = { ...process.env };
delete GIT_ENV_SCRUBBED.GIT_DIR;
delete GIT_ENV_SCRUBBED.GIT_WORK_TREE;
delete GIT_ENV_SCRUBBED.GIT_INDEX_FILE;

function listTrackedMarkdown(repoRoot) {
  const out = execFileSync('git', ['ls-files', '*.md'], { cwd: repoRoot, encoding: 'utf8', env: GIT_ENV_SCRUBBED });
  return out.split(/\r?\n/).filter(Boolean);
}

export function main(argv = process.argv.slice(2)) {
  const repoRoot = process.cwd();
  let files;
  if (argv.length > 0) {
    // Explicit args are NOT exclusion-filtered: isExcluded() governs this file's OWN
    // walk, never a caller naming a path directly -- so a test can point the CLI
    // straight at scripts/fixtures/link-check/*.md without them vanishing first.
    files = argv;
  } else {
    try {
      files = listTrackedMarkdown(repoRoot).filter((f) => !isExcluded(f));
    } catch (err) {
      // Degrade VISIBLY -- never a silent green when git is unavailable (no-external-
      // assumption's own converse: we do not require git, but we never pretend a scan
      // ran when it could not).
      console.log(`link-check: git unavailable, cannot enumerate tracked markdown files (${err.code || err.message})`);
      process.exitCode = 1;
      return;
    }
  }
  if (files.length === 0) {
    console.log('link-check: 0 file(s) to scan -- refusing to report a silent pass');
    process.exitCode = 1;
    return;
  }
  const anchorCache = new Map();
  let total = 0;
  for (const f of files) {
    for (const fnd of checkFile(f, repoRoot, anchorCache)) {
      console.log(`${fnd.file}:${fnd.line} ${fnd.target} ${fnd.reason}`);
      total++;
    }
  }
  console.log(`${total} finding(s) across ${files.length} file(s)`);
  if (total > 0) process.exitCode = 1;
}

// Guard: importing this file (tests do) must never run the CLI. node/runtime.md §4:
// Node resolves import.meta.url to the file's REALPATH, but path.resolve(argv[1]) does
// NOT follow a symlink/junction -- through a link the two differ and a bare compare
// silently never runs main() (exit 0, no output, no signal anything is wrong). Both
// sides go through fs.realpathSync.native; an unresolvable argv falls back to
// not-main rather than crashing on import.
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const invoked = realpathSync.native(process.argv[1]);
    const self = realpathSync.native(fileURLToPath(import.meta.url));
    return invoked === self;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
