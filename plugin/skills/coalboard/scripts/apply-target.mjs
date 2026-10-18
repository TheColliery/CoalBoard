#!/usr/bin/env node
// CoalBoard GATE 3 apply checker (15b5, CWK2-038). The agent runs it on every target BEFORE the digest and again immediately BEFORE each live write.
// A target path in a cloned repo can itself be, or pass through, a planted symlink or junction, so an approved diff that names the LINK path would
// land on the link's target, which can sit outside the project. Lexical containment does not stop a link (node/runtime.md section 4), so this walks
// the path with lstat and canonicalizes with realpath.native. It is a CLI, not a hook: it FAILS LOUD (hooks-safety.md section 1.0). Zero-dependency, Node 22+.
//   node apply-target.mjs <project-root> <target> [<target>...]      a target is relative to the root, or absolute
//   stdout: one line per target, "OK <target>" or "REFUSE <target> <reason> <real path or ->"   reason: link | outside | unresolvable | name
//   exit: 0 every target OK, 1 any target refused, 2 usage error
// Only links AT or BELOW the root are refused (the hook's own split: the root is resolved first, then joined); a link ABOVE the root is the user's layout.
// A target segment below the root that ends in a dot or a space is refused as `name` (18e, T-15b5-1): Windows strips that character, so `foo.`, `foo ` and `foo` are one file there and a target could be checked under one spelling and written under another.
// The rule runs before any file-system call and on every platform, so a target name stays portable and the verdict never depends on what the platform strips; `.` and `..` keep their meaning and the root's own segments are the user's layout, not judged.
// A relative target that starts with a drive prefix (`z:foo/x`) is refused as `name` too (18f, T-18e-2): on win32 it is not absolute, so it would be judged joined to the root, and a writer that resolves it would land on another drive.
// A refused target is never written; the caller lists it as not applicable. Segments are compared with path.relative (segEq), which folds case exactly where the platform does;
// case-folding is never a containment key of its own.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node apply-target.mjs <project-root> <target> [<target>...]\n  prints OK <target> or REFUSE <target> <link|outside|unresolvable|name> <real path or -> per target; exit 0 all OK, 1 any refused, 2 usage error\n  report a problem at https://github.com/TheColliery/CoalBoard/issues\n';
const SPLIT = path.sep === '\\' ? /[\\/]+/ : /\/+/;

const clean = (s) => String(s).replace(/\p{Cc}/gu, '?'); // a target is untrusted text printed back: one line per target
const insideRel = (rel) => rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
const refuse = (reason, real) => ({ ok: false, reason, real: real || '-' });

// the real path of `p`, or of its nearest existing ancestor joined with the missing tail; null when it cannot be resolved
function realOf(p) {
  let cur = p;
  const tail = [];
  for (let i = 0; i < 4096; i++) {
    try { return path.join(fs.realpathSync.native(cur), ...tail.reverse()); } catch (e) {
      if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR')) return null;
      const up = path.dirname(cur);
      if (up === cur) return null;
      tail.push(path.basename(cur));
      cur = up;
    }
  }
  return null;
}

// The textual segment strip, shared by BOTH spellings of a target (R2 HIGH-1): an absolute target must NOT go through path.resolve / path.relative, which collapse a
// `..` lexically before any lstat, so a link before the `..` is never walked. On POSIX the kernel resolves the link first and then `..`, so a/ln/../b is outside the
// project while a lexical collapse reads inside it. Strip the root prefix as TEXT, keep every `..`, and let the one lstat walk below judge it. Segments are compared with
// the platform's own path.relative, so case folds exactly where the platform's does (win32), and not elsewhere.
const segEq = (a, b) => a === b || path.relative(a, b) === '';
function splitAbs(p) {
  const { root } = path.parse(p);
  return { root, segs: p.slice(root.length).split(SPLIT).filter((x) => x && x !== '.') };
}
function belowRoot(target, rootSpelling) {
  const t = splitAbs(target);
  const r = splitAbs(rootSpelling);
  if (!segEq(t.root, r.root) || t.segs.length < r.segs.length) return null;
  for (let i = 0; i < r.segs.length; i++) if (!segEq(t.segs[i], r.segs[i])) return null;
  return t.segs.slice(r.segs.length);
}

// Walk the target's components below the root with lstat. Every verified component is a real non-link directory, so a `..` step is the true parent.
function check(root, rootLexical, target) {
  let segs;
  let cur = root;
  if (path.isAbsolute(target)) {
    const below = belowRoot(target, root) ?? belowRoot(target, rootLexical);
    if (below === null) return refuse('outside', realOf(path.resolve(target))); // not under the root's spelling (over-refuses a collapsible path that only reaches it through ..: the safe direction)
    segs = below;
  } else {
    segs = target.split(SPLIT).filter((s) => s && s !== '.');
  }
  // 18e (T-15b5-1): the name rule, before any lstat. `..` ends in a dot but is a step, not a name. The dot or space also counts right before a `:` (an NTFS stream suffix): `a.txt.::$DATA` is `a.txt.` once Windows strips it (INSPECT M1); a colon on its own is not refused.
  if (segs.some((seg) => seg !== '..' && /[. ](?::|$)/.test(seg))) return refuse('name', '-');
  // 18f (T-18e-2): a RELATIVE target that starts with a drive prefix (one letter and a colon) is refused as `name`: path.isAbsolute is false for `z:foo/x` on win32, so it would be judged joined to the root, while a writer that resolves it lands on another drive. Raw target, every platform; an absolute spelling and a colon later in the name are not touched.
  if (!path.isAbsolute(target) && /^[A-Za-z]:/.test(target)) return refuse('name', '-');
  if (!segs.length) return refuse('unresolvable', root); // the root itself is not a file target
  let missingAt = -1;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg === '..') {
      cur = path.dirname(cur);
      if (!insideRel(path.relative(root, cur)) && path.relative(root, cur) !== '') return refuse('outside', realOf(cur));
      continue;
    }
    const next = path.join(cur, seg);
    let st;
    try { st = fs.lstatSync(next); } catch (e) {
      if (e && e.code === 'ENOENT') { missingAt = i; break; }
      return refuse('unresolvable', '-');
    }
    if (st.isSymbolicLink()) return refuse('link', realOf(next));
    if (i < segs.length - 1 && !st.isDirectory()) return refuse('unresolvable', '-'); // a path through a plain file
    cur = next;
  }
  // a missing tail is forward-only: after the first missing component nothing is left to lstat, so a later `..` could step back onto a link further along the path
  if (missingAt !== -1 && segs.slice(missingAt).includes('..')) return refuse('unresolvable', '-');
  // a missing tail holds no links: apply it lexically to the existing real directory `cur`, and judge the real path of that join
  let finalPath = cur;
  if (missingAt !== -1) {
    finalPath = path.join(cur, ...segs.slice(missingAt));
    if (!insideRel(path.relative(root, finalPath))) return refuse('outside', realOf(finalPath));
  }
  const real = realOf(finalPath);
  if (real === null) return refuse('unresolvable', '-');
  if (!insideRel(path.relative(root, real))) return refuse('outside', real);
  return { ok: true };
}

function main(argv) {
  if (argv[0] === '-h' || argv[0] === '--help') { process.stdout.write(USAGE); return 0; }
  if (argv[0] === '--version') {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.claude-plugin', 'plugin.json'), 'utf8'));
      process.stdout.write(`apply-target (coalboard ${m.version})\n`);
      return 0;
    } catch { process.stderr.write('apply-target: the plugin manifest could not be read\n'); return 2; }
  }
  let args = argv;
  if (args[0] === '--') args = args.slice(1);
  else if (args[0] && args[0].startsWith('-')) { process.stderr.write(`apply-target: unknown flag ${clean(args[0])}\n${USAGE}`); return 2; }
  if (args.length < 2) { process.stderr.write(USAGE); return 2; }
  const [rootArg, ...targets] = args;
  let root;
  try { root = fs.realpathSync.native(path.resolve(rootArg)); } catch {
    process.stderr.write(`apply-target: the project root could not be resolved: ${clean(rootArg)}\n`);
    return 2;
  }
  const rootLexical = path.resolve(rootArg);
  let refused = 0;
  for (const t of targets) {
    let r;
    try { r = check(root, rootLexical, t); } catch { r = refuse('unresolvable', '-'); }
    if (r.ok) process.stdout.write(`OK ${clean(t)}\n`);
    else { refused++; process.stdout.write(`REFUSE ${clean(t)} ${r.reason} ${clean(r.real)}\n`); }
  }
  return refused ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
