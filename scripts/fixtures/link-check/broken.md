# Broken fixture

Planted defects used by `scripts/lib/link-check.test.mjs` to prove the CLI exits 1:
a relative file target that does not exist, and an anchor absent from this file's own
heading set.

See [missing file](./does-not-exist.md) and [bad anchor](#nope).
