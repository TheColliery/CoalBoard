// Build the clean plugin/ dist from source: ship skills/ + hooks/ + commands/ + agents/ +
// the plugin manifest, plus the plugin README (plugin-src/README.md, see scripts/lib/dist-docs.mjs);
// EXCLUDE scripts/ (lib, tests, build/verify are dev-only) and the internal design docs. Zero-dep.
// (cpSync recursive — never flat copyFileSync on a dir.) Importing this file builds nothing: the build
// runs only when the file is invoked directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIST_DOCS } from './lib/dist-docs.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'plugin');

// Refuses BEFORE it removes the old dist: a missing README source leaves plugin/ exactly as it was.
export function buildDist(distRoot = DIST, srcRoot = ROOT) {
  for (const { src } of DIST_DOCS) {
    const abs = path.join(srcRoot, ...src.split('/'));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`${src} is missing or not a file; refusing to build, and the old dist is kept`);
    }
  }
  fs.rmSync(distRoot, { recursive: true, force: true });
  fs.mkdirSync(distRoot, { recursive: true });

  const copy = (rel) => {
    const src = path.join(srcRoot, rel);
    const dst = path.join(distRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
  };
  for (const d of ['skills', 'hooks', 'commands', 'agents']) copy(d);
  copy(path.join('.claude-plugin', 'plugin.json'));
  for (const { src, dst } of DIST_DOCS) {
    const to = path.join(distRoot, dst);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(srcRoot, ...src.split('/')), to);
  }
  return distRoot;
}

// Both sides through realpath: Node resolves import.meta.url to the real file, while argv keeps the path it was typed through, so a junction or
// symlink would make the build a silent no-op (exit 0). scripts/lib/link-check.mjs carries the same guard (29bo M1).
function isMainModule() {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMainModule()) {
  buildDist();
  console.log('plugin/ dist built (skills + hooks + commands + agents + plugin.json + README) from source.');
}
