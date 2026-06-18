// Build the clean plugin/ dist from source: ship skills/ + hooks/ + commands/ + the
// plugin manifest; EXCLUDE scripts/ (lib, tests, build/verify are dev-only) and the
// internal design docs. Zero-dep. (cpSync recursive — never flat copyFileSync on a dir.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'plugin');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copy(rel) {
  const src = path.join(root, rel);
  const dst = path.join(dist, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

for (const d of ['skills', 'hooks', 'commands']) copy(d);
copy(path.join('.claude-plugin', 'plugin.json'));

console.log('plugin/ dist built (skills + hooks + commands + plugin.json) from source.');
