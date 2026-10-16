// Dev-only lib (16f wave 2, CWK2-042): the parent folder of a config write is made ONLY after the chain from the project root is judged, and the target file itself
// is never written through a link. scripts/ never reaches plugin/ (build-plugin.mjs copies skills, hooks, commands, agents and plugin.json only), so nothing here ships.
//
// THE CLASS (found by CoalLedger, ruled by the chief 16e; the exemplar is CoalLedger's mkdirRepoParents in scripts/lib/repo-fs.mjs, commits 31a1c3f and ed36168, ported with
// its semantics unchanged): `fs.mkdirSync(path.dirname(writePath), { recursive: true })` ran BEFORE anything judged the path, so a `.claude` junction (Windows) or symlink (POSIX)
// planted by a cloned repo got an empty `coal` folder made OUTSIDE the project and the config written there too. This walks the root down to the folder one component at a time
// with lstat (node/runtime.md section 4: an allowlist pins the literal expected location, never a realpath compared with a hand-joined string): a link or junction at ANY existing
// component is refused wherever it points, a target inside the project included; a component that exists and is not a directory is refused; each MISSING component is made with a
// plain NON-recursive mkdir and re-checked with lstat right after (a link swapped in between is caught), so a refused target makes nothing. The root itself is not walked (a
// project opened through a linked path still works). Node reports a Windows junction as a symbolic link (measured 2026-10-15), so one lstat test covers both kinds.
// A root of null (the global config in the user's home) keeps the plain recursive make: no containment is asked there, since a dotfile manager may legitimately link ~/.claude.
//
// Residual, named (the exemplar's M8): the root reached through a link, at `dir === root`, is not walked. And the walk and the later write are separate steps, so a link swapped in
// after the last re-check is not caught here. Temp-then-rename for the write itself (node/runtime.md section 5) is a ticket, not part of this unit.
import fs from 'node:fs';
import path from 'node:path';

const FOLDER_FIX = 'make that path a real folder inside the project (remove the link or the file that sits there)';
const FILE_FIX = 'replace it with a regular file (or remove the link) and write through the real path';

export class ConfigWriteRefused extends Error {
  constructor(target, why, fix) {
    super(`refusing to write the config: ${target}: ${why}. Fix: ${fix}, then re-run.`);
    this.name = 'ConfigWriteRefused';
    this.target = target;
  }
}

// A relative path escapes its root when its FIRST SEGMENT is `..` (or it is absolute: a different drive on Windows). A lexical startsWith('..') would also refuse a real
// child folder named `..cfg`, so the test is on the segment.
export function escapesRoot(rel) {
  return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
}

export function mkdirRepoParents(dir, root) {
  if (root == null) { fs.mkdirSync(dir, { recursive: true }); return; }
  const rel = path.relative(root, dir);
  if (rel === '') return;
  if (escapesRoot(rel)) throw new ConfigWriteRefused(dir, 'it is outside the project root', FOLDER_FIX);
  let cur = root;
  for (const part of rel.split(path.sep)) {
    cur = path.join(cur, part);
    let st = null;
    try { st = fs.lstatSync(cur); } catch (e) { if (e.code !== 'ENOENT') throw new ConfigWriteRefused(cur, `it could not be inspected (${e.code})`, FOLDER_FIX); }
    if (st === null) {
      try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw new ConfigWriteRefused(cur, `its folder could not be made (${e.code})`, FOLDER_FIX); }
      try { st = fs.lstatSync(cur); } catch (e) { throw new ConfigWriteRefused(cur, `it could not be inspected after it was made (${e.code})`, FOLDER_FIX); }
    }
    if (st.isSymbolicLink()) throw new ConfigWriteRefused(cur, 'a link or junction sits on the path to the config folder, wherever it points', FOLDER_FIX);
    if (!st.isDirectory()) throw new ConfigWriteRefused(cur, 'it exists and is not a directory', FOLDER_FIX);
  }
}

// The target file itself (the gap beyond the exemplar's folder walk): fs.writeFileSync follows a symlink at the destination (node/runtime.md section 5), so a link planted AT the
// config file would push the config JSON anywhere on disk and report success. A missing target is the normal first write; anything that cannot be inspected is refused, fail closed.
export function refuseLinkedTarget(file) {
  let st;
  try { st = fs.lstatSync(file); } catch (e) {
    if (e.code === 'ENOENT') return;
    throw new ConfigWriteRefused(file, `it could not be inspected (${e.code})`, FILE_FIX);
  }
  if (st.isSymbolicLink()) throw new ConfigWriteRefused(file, 'a link sits at the config file, wherever it points', FILE_FIX);
}
