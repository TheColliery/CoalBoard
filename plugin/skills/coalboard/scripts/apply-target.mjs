#!/usr/bin/env node
// CoalBoard GATE 3 apply checker (15b5, CWK2-038). The agent runs it on every target BEFORE the digest and again immediately BEFORE each live write.
// A target path in a cloned repo can itself be, or pass through, a planted symlink or junction, so an approved diff that names the LINK path would
// land on the link's target, which can sit outside the project. Lexical containment does not stop a link (node/runtime.md section 4), so this walks
// the path with lstat and canonicalizes with realpath.native. It is a CLI, not a hook: it FAILS LOUD (hooks-safety.md section 1.0). Zero-dependency, Node 22+.
//   node apply-target.mjs <project-root> <target> [<target>...]      a target is relative to the root, or absolute
//   stdout: one line per target, "OK <target>" or "REFUSE <target> <reason> <real path or ->"   reason: link | outside | unresolvable
//   exit: 0 every target OK, 1 any target refused, 2 usage error
// Only links AT or BELOW the root are refused (the hook's own split: the root is resolved first, then joined); a link ABOVE the root is the user's layout.
// A refused target is never written; the caller lists it as not applicable. Case-folding is never a correctness key here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node apply-target.mjs <project-root> <target> [<target>...]\n  prints OK <target> or REFUSE <target> <link|outside|unresolvable> <real path or -> per target; exit 0 all OK, 1 any refused, 2 usage error\n  report a problem at https://github.com/TheColliery/CoalBoard/issues\n';
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

// Walk the target's components below the root with lstat. Every verified component is a real non-link directory, so a `..` step is the true parent.
function check(root, rootLexical, target) {
  let segs;
  let cur = root;
  if (path.isAbsolute(target)) {
    const abs = path.resolve(target);
    const relReal = path.relative(root, abs);
    const relLex = path.relative(rootLexical, abs);
    const rel = insideRel(relReal) || relReal === '' ? relReal : (insideRel(relLex) || relLex === '' ? relLex : null);
    if (rel === null) return refuse('outside', realOf(abs));
    segs = rel.split(SPLIT).filter(Boolean);
  } else {
    segs = target.split(SPLIT).filter((s) => s && s !== '.');
  }
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
