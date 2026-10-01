import test from 'node:test';
import assert from 'node:assert/strict';
import { gitEnv } from './git-env.mjs';

function withEnv(patch, fn) {
  const saved = { ...process.env };
  try {
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    return fn();
  } finally {
    for (const k of Object.keys(process.env)) { if (!(k in saved)) delete process.env[k]; }
    Object.assign(process.env, saved);
  }
}

test('gitEnv: strips every GIT_-prefixed key, whatever the name or case', () => {
  withEnv({ GIT_DIR: '/x/.git', GIT_INDEX_FILE: '/x/.git/index', GIT_WORK_TREE: '/x', GIT_SOME_FUTURE_KEY: '1', git_lower: '1', GIT_CEILING_DIRECTORIES: undefined }, () => {
    const env = gitEnv();
    for (const k of Object.keys(env)) assert.ok(!/^git_/i.test(k), `${k} survived the strip`);
  });
});

test('gitEnv: an explicit ceiling is set; with none given an ambient ceiling survives', () => {
  withEnv({ GIT_CEILING_DIRECTORIES: undefined }, () => assert.equal(gitEnv('/parent').GIT_CEILING_DIRECTORIES, '/parent'));
  withEnv({ GIT_CEILING_DIRECTORIES: '/user/set' }, () => assert.equal(gitEnv().GIT_CEILING_DIRECTORIES, '/user/set'));
  withEnv({ GIT_CEILING_DIRECTORIES: undefined }, () => assert.equal('GIT_CEILING_DIRECTORIES' in gitEnv(), false));
});

test('gitEnv: non-GIT keys pass through, and process.env itself is never mutated', () => {
  withEnv({ CB_GITENV_PROBE: 'kept', GIT_DIR: '/x/.git' }, () => {
    const env = gitEnv('/c');
    assert.equal(env.CB_GITENV_PROBE, 'kept');
    assert.equal(process.env.GIT_DIR, '/x/.git', 'the strip works on a copy');
  });
});
