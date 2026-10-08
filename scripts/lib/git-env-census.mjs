// CWK-133 / CWK-136 -- the git-spawn census. Does every `git` child this room spawns take its
// environment from gitEnv() (scripts/lib/git-env.mjs) or from a checked allowlist, and only from those?
//
// It proves SAFETY, not presence. Inside a linked worktree a git hook exports an absolute GIT_DIR, and a child that
// inherits it acts on the enclosing repository (CWK-133). 08d rewrote the census over TOKENS (not regexes over text), so a
// comment, a string, a regex literal or a template literal can no longer hide or fake a spawn, and judged it against the
// whole witness list (U/scratchpad/dispatch/08d-census-witness-list.md: F1-F42 must FAIL, R1-R2 must be counted and FAIL,
// P1-P6 must PASS with no pin). A file it cannot read whole (an unterminated string, unbalanced braces) is a FINDING.
//
// A git spawn is a call of spawnSync / execFileSync / spawn / execFile (a bare name or a property of anything) whose first
// argument is a plain string or an unsubstituted template literal whose last path segment is git or git.exe. Its options
// object (a literal, with no spread, computed key or method in it) must carry exactly ONE `env` key, and that env is
// SAFE only when it is one of
//   (i)   gitEnv(...) / gitTestEnv(...) ALONE -- the whole expression is one call. The name is trusted only when this file
//         does not define, alias or reassign it (an import is fine): a file-local gitEnv proves nothing by its NAME (F42), so it
//         is read as in (iv), and Bankfire's denylist copy of it (an Object.entries(process.env) filter) is a pin, not a pass.
//   (ii)  an IDENTIFIER bound by exactly one `const|let|var NAME = <(i), (iii) or (iv)>;` in this file (no export), where EVERY
//         other occurrence of NAME is the env value of a spawn call's options object -- never an argument, an alias, an
//         assignment, a method call, a parameter, a shadow or a second declaration. That whitelist is what closes mutation
//         (F15-F18, F35-F40) and scope confusion (F31-F34) without a scope analysis: anything else is unprovable and refused.
//   (iii) an ALLOWLIST object literal (inline or as the initializer of (ii)): plain-identifier or quoted-literal keys, no
//         duplicate key (case-insensitive: a Windows env is), no __proto__ key (it sets the prototype, which git inherits through
//         for...in), no GIT_* key other than GIT_CONFIG_NOSYSTEM,
//         GIT_TERMINAL_PROMPT and GIT_CEILING_DIRECTORIES (each only NARROWS git); GIT_CONFIG_NOSYSTEM present as the
//         literal '1' and AFTER every spread; values drawn from a small token set (a literal, a call on a name, a regex literal,
//         a `process.env.X` or `process.env['X']` read of ONE key -- never the whole env, an object, a spread or an arrow); its
//         only spread is `...Object.fromEntries(KEYS.filter(f).map(g))` or `...Object.fromEntries(KEYS.map(g))` where KEYS is
//         a const array of plain string literals (no GIT_* name beyond the three) that is read nowhere else, f is a small
//         predicate over its parameter and process.env[param] / `param in process.env`, and g is exactly
//         `(k) => [k, process.env[k]]`. A template literal inside the region is refused; a regex literal is lexed, not trusted
//         (F41: the lexer sees every key, so a quote inside a regex cannot hide a GIT_DIR entry).
//   (iv)  a CALL of a helper this file defines once and only ever calls: `const NAME = (p) => ({...})`,
//         `const NAME = (p) => { return {...}; }` or `function NAME(p) { return {...}; }`, simple parameters, and the one returned
//         object judged as (iii) (P2: the canon release-notes.test.mjs sandboxEnv). Any other body -- a second return path (F13),
//         a default parameter, a statement before the return -- and any non-call use of NAME is refused.
// Anything else -- a helper called but defined elsewhere (F14), an expression that merely contains gitEnv( -- is a finding unless
// its file is blob-pinned in EXEMPT_CARRIERS.
//
// NAMED OPEN, on purpose:
//   - a callee reached any other way (`const run = spawnSync`, a wrapper defined elsewhere), a command that is not a literal
//     (`spawnSync(bin, ...)`, a template with ${}), git through a shell (`sh -c`, execSync strings, `shell:`);
//   - eval, `with`, Function(...), getters on the options object built elsewhere, and the body of an IMPORTED gitEnv/gitTestEnv
//     (git-env.mjs is its own test's job, not read here);
//   - the lexer's one heuristic (regex versus division for a /): a regex follows an operator, a keyword like return, the ) of an
//     if/while/for/with, and a } that closes a statement block; a division follows a name, a number, a string, any other ) and an
//     object-literal }. A file that fools it can hide a git spawn OR a statement that changes an env (a mutation, F15): a regex
//     read as division opens a string at its quote and swallows the next statement. The shapes still ambiguous are a } that ends a
//     function EXPRESSION (read as a block, so a / after it is a regex) and an unusual ) (division). A file that unbalances the
//     braces is a finding; one that stays balanced and hides a statement is not seen.
// Pure: a list of { rel, text } in, a report out, so it is unit-tested red-first without a clone.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

class Unreadable extends Error {}

const BS = String.fromCharCode(92);
const CALLEES = new Set(['spawnSync', 'execFileSync', 'spawn', 'execFile']);
const TRUSTED = new Set(['gitEnv', 'gitTestEnv']);
const ALLOWED_GIT_KEYS = new Set(['GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT', 'GIT_CEILING_DIRECTORIES']);
const PUNCTS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'delete', 'void', 'throw', 'new', 'instanceof', 'yield', 'await']);
const CONTROL_WORDS = new Set(['if', 'while', 'for', 'with']);
const OPENERS = { '(': ')', '[': ']', '{': '}' };

const isP = (t, v) => !!t && t.t === 'p' && t.v === v;
const isId = (t, v) => !!t && t.t === 'id' && (v === undefined || t.v === v);

// The cooked value of a JS string body (escapes resolved), so 'GIT_\x44IR' is read as GIT_DIR.
function cook(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== BS) { out += c; continue; }
    const d = raw[++i];
    if (d === 'n') out += '\n';
    else if (d === 't') out += '\t';
    else if (d === 'r') out += '\r';
    else if (d === '0') out += String.fromCharCode(0);
    else if (d === 'x') { out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16)); i += 2; }
    else if (d === 'u' && raw[i + 1] === '{') { const e = raw.indexOf('}', i); out += String.fromCodePoint(parseInt(raw.slice(i + 2, e), 16)); i = e; }
    else if (d === 'u') { out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 5), 16)); i += 4; }
    else if (d === '\n') { /* line continuation */ }
    else if (d !== undefined) out += d;
  }
  return out;
}

// text -> tokens { t: id|num|str|tpl|tplHead|tplMid|tplTail|re|p, v, s, e }. Comments and whitespace are dropped.
function tokenize(text) {
  const toks = [];
  const stack = [];
  const parens = []; // per ( : did an if/while/for/with open it? Then the / after its ) starts a regex (F45)
  const n = text.length;
  let i = text.startsWith('#!') ? Math.max(text.indexOf('\n'), 0) : 0;
  const regexOk = () => {
    const t = toks[toks.length - 1];
    if (!t) return true;
    if (t.t === 'num' || t.t === 'str' || t.t === 're' || t.t === 'tpl' || t.t === 'tplTail') return false;
    if (t.t === 'id') return REGEX_AFTER_WORD.has(t.v);
    if (t.t === 'p') return t.v === ')' ? t.ctl === true : t.v === '}' ? t.block === true : t.v !== ']';
    return true;
  };
  // from = the index just after the opening backtick or the closing brace of a ${...}; returns the index after the piece.
  const template = (from, first) => {
    for (let j = from; j < n; j++) {
      const c = text[j];
      if (c === BS) { j++; continue; }
      if (c === '`') { toks.push({ t: first ? 'tpl' : 'tplTail', v: cook(text.slice(from, j)), s: from - 1, e: j + 1 }); return j + 1; }
      if (c === '$' && text[j + 1] === '{') { toks.push({ t: first ? 'tplHead' : 'tplMid', v: cook(text.slice(from, j)), s: from - 1, e: j + 2 }); stack.push('tpl'); return j + 2; }
    }
    throw new Unreadable('unterminated template literal');
  };
  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); i = e === -1 ? n : e; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); if (e === -1) throw new Unreadable('unterminated block comment'); i = e + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (; j < n && text[j] !== c; j++) {
        if (text[j] === BS) { if (text[j + 1] === '\r' && text[j + 2] === '\n') j++; j++; }
        else if (text[j] === '\n') throw new Unreadable('unterminated string');
      }
      if (j >= n) throw new Unreadable('unterminated string');
      toks.push({ t: 'str', v: cook(text.slice(i + 1, j)), s: i, e: j + 1 });
      i = j + 1;
      continue;
    }
    if (c === '`') { i = template(i + 1, true); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(text[j])) j++;
      toks.push({ t: 'num', v: text.slice(i, j), s: i, e: j });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 127 || (c === '#' && /[A-Za-z_$]/.test(text[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && (/[\w$]/.test(text[j]) || text.charCodeAt(j) > 127)) j++;
      toks.push({ t: 'id', v: text.slice(i, j), s: i, e: j });
      i = j;
      continue;
    }
    if (c === BS) throw new Unreadable('a backslash outside a string (an escaped identifier)');
    if (c === '/' && regexOk()) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      for (; j < n; j++) {
        const d = text[j];
        if (d === '\n') break;
        if (d === BS) { j++; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { closed = true; break; }
      }
      if (closed) {
        j++;
        while (j < n && /[A-Za-z]/.test(text[j])) j++;
        toks.push({ t: 're', v: text.slice(i, j), s: i, e: j });
        i = j;
        continue;
      }
    }
    if (c === '{') {
      // A { opens a statement BLOCK after ) ; { } => or a name (class A {), else an object literal. A / after a block's } is a regex (F45).
      const p = toks[toks.length - 1];
      const block = !p || (p.t === 'p' && [')', ';', '{', '}', '=>'].includes(p.v)) || (p.t === 'id' && !REGEX_AFTER_WORD.has(p.v)) || (p.t === 'id' && ['else', 'do'].includes(p.v));
      stack.push(block ? 'block' : 'obj');
      toks.push({ t: 'p', v: '{', s: i, e: i + 1 });
      i++;
      continue;
    }
    if (c === '}') {
      const top = stack.pop();
      if (top === undefined) throw new Unreadable('unbalanced braces: a } with no {');
      if (top === 'tpl') { i = template(i + 1, false); continue; }
      toks.push({ t: 'p', v: '}', s: i, e: i + 1, block: top === 'block' });
      i++;
      continue;
    }
    if (c === '(') { const p = toks[toks.length - 1]; parens.push(!!p && p.t === 'id' && CONTROL_WORDS.has(p.v)); }
    if (c === ')') { toks.push({ t: 'p', v: ')', s: i, e: i + 1, ctl: parens.pop() === true }); i++; continue; }
    const long = PUNCTS.find((p) => text.startsWith(p, i));
    const v = long || c;
    toks.push({ t: 'p', v, s: i, e: i + v.length });
    i += v.length;
  }
  if (stack.length) throw new Unreadable('unbalanced braces: a { never closed');
  return toks;
}

// Index of the token that closes the opener at `i` (a bracket or a template head), -1 when unbalanced.
function closeIdx(toks, i) {
  const stack = [];
  for (let k = i; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'p' && OPENERS[t.v]) stack.push(OPENERS[t.v]);
    else if (t.t === 'tplHead') stack.push('tpl');
    else if (t.t === 'tplMid') { if (stack[stack.length - 1] !== 'tpl') return -1; }
    else if (t.t === 'tplTail') { if (stack.pop() !== 'tpl') return -1; if (!stack.length) return k; }
    else if (t.t === 'p' && (t.v === ')' || t.v === ']' || t.v === '}')) { if (stack.pop() !== t.v) return -1; if (!stack.length) return k; }
  }
  return -1;
}

// The [start, end) token ranges between the depth-0 commas of toks[a..b), null when a bracket does not close inside it.
function splitTop(toks, a, b) {
  const out = [];
  let s = a;
  for (let k = a; k < b; k++) {
    const t = toks[k];
    if ((t.t === 'p' && OPENERS[t.v]) || t.t === 'tplHead') { const c = closeIdx(toks, k); if (c === -1 || c >= b) return null; k = c; }
    else if (isP(t, ',')) { out.push([s, k]); s = k + 1; }
  }
  out.push([s, b]);
  return out;
}

// The properties of the object literal whose `{` is toks[o] and `}` is toks[c].
function propsOf(toks, o, c) {
  const ranges = splitTop(toks, o + 1, c);
  if (!ranges) return null;
  const out = [];
  for (const [s, e] of ranges) {
    if (s === e) continue;
    const a = toks[s];
    if (isP(a, '...')) out.push({ kind: 'spread', s, e });
    else if (isP(a, '[')) out.push({ kind: 'computed', s, e });
    else if ((a.t === 'id' || a.t === 'str' || a.t === 'num') && isP(toks[s + 1], ':')) out.push({ kind: 'kv', key: a.v, s, e, vs: s + 2, ve: e });
    else if (a.t === 'id' && e === s + 1) out.push({ kind: 'shorthand', key: a.v, s, e });
    else out.push({ kind: 'other', s, e });
  }
  return out;
}

const isGitCommand = (v) => /^git(\.exe)?$/i.test(v.split('/').pop().split(BS).pop());
const isDecl = (toks, i) => isId(toks[i - 1]) && ['const', 'let', 'var'].includes(toks[i - 1].v) && isP(toks[i + 1], '=');

// Every spawn-family call: { callee, k, open, close, args } (args null when its brackets do not balance).
function spawnCalls(toks) {
  const calls = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== 'id' || !CALLEES.has(t.v) || !isP(toks[k + 1], '(') || isId(toks[k - 1], 'function')) continue;
    const close = closeIdx(toks, k + 1);
    calls.push({ callee: t.v, k, open: k + 1, close, args: close === -1 ? null : splitTop(toks, k + 2, close) });
  }
  return calls;
}

// The options-object arguments of a call: { o, c } token indexes of `{` and `}`.
function optionObjects(toks, call) {
  const out = [];
  for (const [s, e] of call.args.slice(1)) if (isP(toks[s], '{') && closeIdx(toks, s) === e - 1) out.push({ o: s, c: e - 1 });
  return out;
}

function buildCtx(rel, text) {
  const toks = tokenize(text);
  const calls = spawnCalls(toks);
  // The only places an env identifier may legitimately appear besides its declaration: the env value of a spawn's options.
  const envUse = new Set();
  for (const call of calls) {
    if (!call.args) continue;
    for (const { o, c } of optionObjects(toks, call)) {
      for (const p of propsOf(toks, o, c) || []) {
        if (p.key !== 'env') continue;
        if (p.kind === 'shorthand') envUse.add(p.s);
        else if (p.kind === 'kv' && p.ve - p.vs === 1 && toks[p.vs].t === 'id') envUse.add(p.vs);
      }
    }
  }
  // The only places a key list may be read: `...Object.fromEntries(KEYS.filter(` and `...Object.fromEntries(KEYS.map(`.
  const keyUse = new Set();
  for (let i = 0; i < toks.length; i++) {
    if (isP(toks[i], '...') && isId(toks[i + 1], 'Object') && isP(toks[i + 2], '.') && isId(toks[i + 3], 'fromEntries') && isP(toks[i + 4], '(')
      && isId(toks[i + 5]) && isP(toks[i + 6], '.') && (isId(toks[i + 7], 'filter') || isId(toks[i + 7], 'map'))) keyUse.add(i + 5);
  }
  return { rel, text, toks, calls, envUse, keyUse };
}

// Occurrences of the identifier `name` that are NOT a property access (x.name) or an object key ({ name: ... }).
function occurrences(ctx, name) {
  const { toks } = ctx;
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (!isId(toks[i], name)) continue;
    const prev = toks[i - 1];
    if (isP(prev, '.') || isP(prev, '?.')) continue;
    if ((isP(prev, '{') || isP(prev, ',')) && isP(toks[i + 1], ':')) continue;
    out.push(i);
  }
  return out;
}

// A declaration or initializer ends at its close bracket; the next token must end the statement, never continue it.
function endsStatement(ctx, c) {
  const next = ctx.toks[c + 1];
  if (!next || isP(next, ';') || isP(next, '}')) return true;
  return next.t === 'id' && /\n/.test(ctx.text.slice(ctx.toks[c].e, next.s));
}

// Params of a helper are plain names: ids and commas, no default value, no destructuring.
const simpleParams = (toks, open, close) => toks.slice(open + 1, close).every((t, j) => (j % 2 === 0 ? t.t === 'id' : isP(t, ',')));

// null when the helper definition whose name is toks[d] returns exactly one safe allowlist object: `const NAME = (p) => ({...})`,
// `const NAME = (p) => { return {...}; }` or `function NAME(p) { return {...}; }`. A second return path, a default parameter or any other
// statement makes it unreadable (F13), so it is refused.
function helperBodyRefusal(ctx, d) {
  const { toks } = ctx;
  const bad = `env helper ${toks[d].v} is not a function whose whole body returns one object literal the census can read (F13/F42, CWK-136)`;
  let k;
  if (isId(toks[d - 1], 'function')) {
    if (!isP(toks[d + 1], '(')) return bad;
    const pc = closeIdx(toks, d + 1);
    if (pc === -1 || !simpleParams(toks, d + 1, pc)) return bad;
    k = pc + 1;
  } else {
    k = d + 2;
    if (isP(toks[k], '(')) { const pc = closeIdx(toks, k); if (pc === -1 || !simpleParams(toks, k, pc)) return bad; k = pc + 1; }
    else if (isId(toks[k])) k++;
    else return bad;
    if (!isP(toks[k], '=>')) return bad;
    k++;
    if (isP(toks[k], '(') && isP(toks[k + 1], '{')) {
      const c = closeIdx(toks, k + 1);
      return c !== -1 && isP(toks[c + 1], ')') && endsStatement(ctx, c + 1) ? allowlistRefusal(ctx, k + 1) : bad;
    }
  }
  if (!isP(toks[k], '{') || !isId(toks[k + 1], 'return') || !isP(toks[k + 2], '{')) return bad;
  const c = closeIdx(toks, k + 2);
  const end = closeIdx(toks, k);
  if (c === -1 || end === -1 || !(c + 1 === end || (isP(toks[c + 1], ';') && c + 2 === end)) || !endsStatement(ctx, end)) return bad;
  return allowlistRefusal(ctx, k + 2);
}

// null when a call NAME(...) provably returns a safe env. A name this file does NOT define may be an imported gitEnv/gitTestEnv
// (trusted by name only then, F42); any other name is a helper the census cannot follow. A helper this file defines is read
// (helperBodyRefusal), and it must be defined once and only ever called -- no alias, no assignment, no other use.
function helperCallRefusal(ctx, name) {
  const { toks } = ctx;
  const defs = [];
  for (const i of occurrences(ctx, name)) {
    const prev = toks[i - 1];
    if (isDecl(toks, i) || isId(prev, 'function')) defs.push(i);
    else if (isId(prev, 'as') || isId(prev, 'class') || isP(toks[i + 1], '=')) return `env calls ${name}(), but this file aliases, reassigns or redefines ${name}, so the name proves nothing (F42, CWK-136)`;
  }
  if (defs.length > 1) return `env helper ${name} is defined ${defs.length} times in this file (CWK-136)`;
  if (defs.length === 0) return TRUSTED.has(name) ? null : `env is not gitEnv(...) alone (got: ${name}(...)) -- a helper defined elsewhere cannot be followed; pin the file by blob (CWK-136)`;
  const other = occurrences(ctx, name).some((i) => i !== defs[0] && !isP(toks[i + 1], '('));
  return other ? `env helper ${name} is used where the census cannot follow it (CWK-136)` : helperBodyRefusal(ctx, defs[0]);
}

const VALUE_P = new Set(['.', '?.', '(', ')', '[', ']', ',', '+', '-', '*', '?', ':', '||', '&&', '??', '!', '===', '!==', '==', '!=', '<', '>', '<=', '>=']);
const VALUE_BAN = new Set(['Object', 'Reflect', 'globalThis', 'eval', 'Function', 'require', 'import']);
const PROCESS_OK = new Set(['platform', 'cwd', 'execPath', 'arch', 'pid', 'version']);

// null when toks[vs..ve) is a harmless allowlist VALUE: it reads at most one named key of process.env, and builds no object.
function valueRefusal(ctx, vs, ve) {
  const { toks } = ctx;
  for (let k = vs; k < ve; k++) {
    const t = toks[k];
    if (t.t === 'p') { if (!VALUE_P.has(t.v)) return `env value holds ${t.v}, which the census does not read inside an allowlist (UMB-456 (2))`; continue; }
    if (t.t !== 'id') continue;
    if (VALUE_BAN.has(t.v)) return `env value uses ${t.v}, which the census does not read inside an allowlist (UMB-456 (2))`;
    if (t.v !== 'process') continue;
    if (isP(toks[k + 1], '.') && isId(toks[k + 2])) {
      if (toks[k + 2].v !== 'env') { if (PROCESS_OK.has(toks[k + 2].v)) { k += 2; continue; } }
      else if (isP(toks[k + 3], '.') && isId(toks[k + 4])) { k += 4; continue; }
      else if (isP(toks[k + 3], '[') && toks[k + 4] && toks[k + 4].t === 'str' && isP(toks[k + 5], ']')) { k += 5; continue; }
    }
    return 'env value reads the whole process.env, not one named key (CWK-136)';
  }
  return null;
}

const FILTER_P = new Set(['!==', '===', '!=', '==', '&&', '||', '!', '(', ')']);

// null when toks[a..b) is the plain callback the census reads: (k) => [k, process.env[k]] for a map, a small predicate for a filter.
function arrowRefusal(ctx, a, b, kind) {
  const { toks } = ctx;
  const bad = 'env key pick uses a callback that is not the plain form the census reads: (k) => [k, process.env[k]] for map, a predicate over k and process.env[k] for filter (UMB-456 (2))';
  let k = a;
  let param;
  if (isP(toks[k], '(') && isId(toks[k + 1]) && isP(toks[k + 2], ')')) { param = toks[k + 1].v; k += 3; }
  else if (isId(toks[k]) && isP(toks[k + 1], '=>')) { param = toks[k].v; k += 1; }
  else return bad;
  if (!isP(toks[k], '=>')) return bad;
  k++;
  if (kind === 'map') {
    const want = ['[', param, ',', 'process', '.', 'env', '[', param, ']', ']'];
    if (b - k !== want.length) return bad;
    return want.every((v, j) => (toks[k + j].t === 'p' || toks[k + j].t === 'id') && toks[k + j].v === v) ? null : bad;
  }
  for (; k < b; k++) {
    const t = toks[k];
    if (t.t === 'p') { if (!FILTER_P.has(t.v)) return bad; continue; }
    if (t.t !== 'id') return bad;
    if (t.v === param || t.v === 'undefined' || t.v === 'null' || t.v === 'in') continue;
    if (t.v === 'process' && isP(toks[k + 1], '.') && isId(toks[k + 2], 'env')) {
      if (isP(toks[k + 3], '[') && isId(toks[k + 4], param) && isP(toks[k + 5], ']')) { k += 5; continue; }
      if (isId(toks[k - 1], 'in') && isId(toks[k - 2], param) && !isP(toks[k + 3], '.') && !isP(toks[k + 3], '[')) { k += 2; continue; }
    }
    return bad;
  }
  return null;
}

// null when `name` is a const array of plain string literals, read nowhere but inside an allowed pick, naming no forbidden GIT_* key.
function keyListRefusal(ctx, name) {
  const { toks } = ctx;
  let decl = -1;
  for (const i of occurrences(ctx, name)) {
    if (isDecl(toks, i)) { if (decl !== -1) return `env key list ${name} is declared more than once (UMB-456 (2))`; decl = i; }
    else if (!ctx.keyUse.has(i)) return `env key list ${name} is used where it could be mutated or copied; only its declaration and the pick inside the allowlist may read it (UMB-456 (2))`;
  }
  if (decl === -1 || !isP(toks[decl + 2], '[') || isId(toks[decl - 2], 'export')) return `env filters ${name}, which is not a single const [...] key list in this file (UMB-456 (2))`;
  const close = closeIdx(toks, decl + 2);
  const items = close === -1 ? null : splitTop(toks, decl + 3, close);
  if (!items || !endsStatement(ctx, close)) return `env key list ${name} is not a plain array literal the census can read (UMB-456 (2))`;
  for (const [s, e] of items) {
    if (s === e) continue;
    if (e - s !== 1 || toks[s].t !== 'str') return `env key list ${name} holds an element that is not a plain string literal (UMB-456 (2))`;
    const up = toks[s].v.toUpperCase();
    if (/^GIT_/.test(up) && !ALLOWED_GIT_KEYS.has(up)) return `env key list ${name} names ${toks[s].v}, a GIT_* variable that can aim git at another repository (UMB-456 (2))`;
  }
  return null;
}

// null when the spread p is exactly ...Object.fromEntries(KEYS.filter(f).map(g)) or ...Object.fromEntries(KEYS.map(g)), with safe KEYS, f, g.
function spreadRefusal(ctx, p) {
  const { toks } = ctx;
  const bad = 'env spreads something other than Object.fromEntries(KEYS.filter(...).map(...)) or Object.fromEntries(KEYS.map(...)), which the census cannot see through (UMB-456 (2))';
  const open = p.s + 4;
  if (!(isId(toks[p.s + 1], 'Object') && isP(toks[p.s + 2], '.') && isId(toks[p.s + 3], 'fromEntries') && isP(toks[open], '('))) return bad;
  const close = closeIdx(toks, open);
  if (close !== p.e - 1) return bad;
  let k = open + 1;
  const keys = toks[k];
  if (!isId(keys) || !isP(toks[k + 1], '.') || !(isId(toks[k + 2], 'filter') || isId(toks[k + 2], 'map')) || !isP(toks[k + 3], '(')) return bad;
  const method = toks[k + 2].v;
  const c1 = closeIdx(toks, k + 3);
  if (c1 === -1) return bad;
  let why = arrowRefusal(ctx, k + 4, c1, method);
  if (why) return why;
  k = c1 + 1;
  if (method === 'filter') {
    if (!(isP(toks[k], '.') && isId(toks[k + 1], 'map') && isP(toks[k + 2], '('))) return bad;
    const c2 = closeIdx(toks, k + 2);
    if (c2 === -1) return bad;
    why = arrowRefusal(ctx, k + 3, c2, 'map');
    if (why) return why;
    k = c2 + 1;
  }
  return k === close ? keyListRefusal(ctx, keys.v) : bad;
}

// null when the object literal at toks[o] is a safe allowlist env.
function allowlistRefusal(ctx, o) {
  const { toks } = ctx;
  const c = closeIdx(toks, o);
  for (let k = o; k <= c; k++) if (['tpl', 'tplHead', 'tplMid', 'tplTail'].includes(toks[k].t)) return 'env holds a template literal, which the census does not read inside an allowlist (UMB-456 (2))';
  const props = propsOf(toks, o, c);
  if (!props) return 'env object has brackets the census cannot balance (UMB-456 (2))';
  const seen = new Set();
  let sentinel = -1;
  let lastSpread = -1;
  for (const [n, p] of props.entries()) {
    if (p.kind === 'computed' || p.kind === 'other') return `env object has a ${p.kind} property the census cannot read (UMB-456 (2))`;
    if (p.kind === 'spread') { const why = spreadRefusal(ctx, p); if (why) return why; lastSpread = n; continue; }
    // F44: in an object literal this key sets the PROTOTYPE, and Node's spawn walks the env with for...in, so git inherits what it holds.
    if (p.key === '__proto__') return 'env object has a __proto__ key, which sets the prototype that git inherits through for...in (F44, UMB-456 (2))';
    const up = String(p.key).toUpperCase();
    if (seen.has(up)) return `env object repeats the key ${p.key}; the last one wins (UMB-456 (2))`;
    seen.add(up);
    if (/^GIT_/.test(up) && !ALLOWED_GIT_KEYS.has(up)) return `env names ${p.key}, a GIT_* variable that can aim git at another repository (UMB-456 (2))`;
    if (up === 'GIT_CONFIG_NOSYSTEM') {
      if (p.kind !== 'kv' || p.key !== 'GIT_CONFIG_NOSYSTEM' || p.ve - p.vs !== 1 || toks[p.vs].t !== 'str' || toks[p.vs].v !== '1') return 'env does not set GIT_CONFIG_NOSYSTEM to the literal string 1 (UMB-456 (2))';
      sentinel = n;
    } else if (p.kind === 'kv') {
      const why = valueRefusal(ctx, p.vs, p.ve);
      if (why) return why;
    }
  }
  if (sentinel === -1) return 'env does not set GIT_CONFIG_NOSYSTEM to 1 (UMB-456 (2))';
  if (lastSpread > sentinel) return 'env spreads AFTER GIT_CONFIG_NOSYSTEM, which could overwrite it (UMB-456 (2))';
  return null;
}

// null when the initializer starting at toks[i] is a safe env: gitEnv(...) alone or an allowlist object, and it ends its statement.
function initializerRefusal(ctx, i) {
  const { toks } = ctx;
  if (isP(toks[i], '{')) {
    const c = closeIdx(toks, i);
    return c !== -1 && endsStatement(ctx, c) ? allowlistRefusal(ctx, i) : 'env initializer is an object the census cannot read to its end (CWK-136)';
  }
  if (isId(toks[i]) && isP(toks[i + 1], '(')) {
    const c = closeIdx(toks, i + 1);
    return c !== -1 && endsStatement(ctx, c) ? helperCallRefusal(ctx, toks[i].v) : 'env initializer is a call the census cannot read to its end (CWK-136)';
  }
  return 'env initializer is neither a helper call nor an allowlist object (CWK-136)';
}

// null when the env identifier `name` provably holds a safe env at every spawn that reads it.
function identifierRefusal(ctx, name) {
  const { toks } = ctx;
  const decls = [];
  for (const i of occurrences(ctx, name)) {
    if (isDecl(toks, i)) decls.push(i);
    else if (!ctx.envUse.has(i)) return `env identifier ${name} is used where the census cannot follow it (an alias, an argument, an assignment, a method call, a parameter or a shadow) -- refused, not guessed (CWK-136)`;
  }
  if (decls.length !== 1) return decls.length === 0 ? `env identifier ${name} has no single "const ${name} = ..." declaration in this file (CWK-136)` : `env identifier ${name} is declared ${decls.length} times in this file, so the census cannot tell which one a spawn sees (CWK-136)`;
  if (isId(toks[decls[0] - 2], 'export')) return `env identifier ${name} is exported, so an importer can mutate it (CWK-136)`;
  return initializerRefusal(ctx, decls[0] + 2);
}

// null when the git spawn's env is safe, else the reason.
function spawnRefusal(ctx, call) {
  const { toks } = ctx;
  const objs = optionObjects(toks, call);
  if (objs.length > 1) return 'has more than one options object the census cannot tell apart (CWK-136)';
  if (objs.length === 0) return "carries no 'env:' -- it inherits the ambient GIT_* family (CWK-133)";
  const props = propsOf(toks, objs[0].o, objs[0].c);
  if (!props) return 'options object has brackets the census cannot balance (CWK-136)';
  const odd = props.find((p) => p.kind === 'spread' || p.kind === 'computed' || p.kind === 'other');
  if (odd) return `options object holds a ${odd.kind} property the census cannot read (CWK-136)`;
  const envs = props.filter((p) => p.key === 'env');
  if (envs.length === 0) return "carries no 'env:' -- it inherits the ambient GIT_* family (CWK-133)";
  if (envs.length > 1) return 'repeats the env key; the last one wins (CWK-136)';
  const p = envs[0];
  if (p.kind === 'shorthand') return identifierRefusal(ctx, 'env');
  const first = toks[p.vs];
  if (p.ve - p.vs === 1 && first.t === 'id') return identifierRefusal(ctx, first.v);
  if (first.t === 'id' && isP(toks[p.vs + 1], '(') && closeIdx(toks, p.vs + 1) === p.ve - 1) return helperCallRefusal(ctx, first.v);
  if (isP(first, '{') && closeIdx(toks, p.vs) === p.ve - 1) return allowlistRefusal(ctx, p.vs);
  const expr = ctx.text.slice(first.s, toks[p.ve - 1].e);
  if (toks.slice(p.vs, p.ve).some((t) => isId(t, 'process'))) return 'takes env from process.env -- route it through gitEnv() (CWK-136)';
  return `env is not gitEnv(...) alone (got: ${expr.slice(0, 60)}) -- an expression that merely contains it is refused (CWK-136)`;
}

// R14 / CWK-174 -- the house secret scan arrives as byte-equal copies of the published-code template (SERIES-CANON
// "Secret scan": a parity check measures it), so this room cannot route their git spawns through gitEnv() without
// breaking that parity. Each file below is exempt ONLY while its content is exactly the pinned blob: any edit, or a template
// re-sync that changes it, makes the entry a finding again ("re-derive"), so the exemption cannot widen or outlive its reason
// silently. The pin is a git blob id (git hash-object <file>). The real fix belongs to the canon (the .github deputy).
// Why each stays (08d, measured with the 08d census against the re-copied blobs; the finding it raises without the pin is quoted):
//   secret-scan.test.mjs  d0db994d (Bankfire 6dd3c8e8): "env helper gitEnv is not a function whose whole body returns one object literal the
//     census can read" -- it defines its own gitEnv as `(envSeen = { ...withoutGit(), ... })`, a DENYLIST that strips GIT_* from a copy of the
//     whole process.env. Its decoy call now takes that sandbox env too (no longer a separate finding), but the sandbox is not an allowlist.
//   secret-gate.test.mjs  71452210 (canon d31a091): "env spreads something other than Object.fromEntries(KEYS.filter(...).map(...))" --
//     `env: { ...gitEnv(), ...extra }` spreads around the helper (:40); its other two spawns call a gitEnv the file defines itself.
//   secret-gate.mjs       856956a1 (canon d31a091): the same "env spreads something other than Object.fromEntries(...)" -- its own gitEnv is an
//     Object.entries(process.env) filter that strips GIT_*, a denylist, so the name cannot vouch for it (F42).
// Released at 08d: release-notes.test.mjs (canon 7e779ef8): its sandboxEnv is one literal of named keys defined in the same file (P2), read as (iv).
export const EXEMPT_CARRIERS = {
  'scripts/secret-scan.test.mjs': 'd0db994df855ccd647f3ded878a6867bb198e196',
  'scripts/secret-gate.test.mjs': '71452210d6a6f793895bc502557fce7e1f3e890c',
  'scripts/secret-gate.mjs': '856956a1cca6f716e5507f6c23ac90ed34cbbe5f',
};

// The git blob id of `text`, as `git hash-object` prints it for a file holding exactly these bytes.
export function blobId(text) {
  const body = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + body.length + String.fromCharCode(0)), body])).digest('hex');
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

export function censusGitSpawns(files, exempt = EXEMPT_CARRIERS) {
  const findings = [];
  let spawns = 0;
  for (const { rel, text } of files) {
    if (Object.hasOwn(exempt, rel)) {
      const id = blobId(text);
      if (id === exempt[rel]) continue;
      findings.push(`${rel} is an exempt byte-equal org carrier but its blob id is ${id}, not the pinned ${exempt[rel]} -- re-derive it from .github/templates/published-code/scripts/ (CWK-174)`);
      continue;
    }
    let ctx;
    try { ctx = buildCtx(rel, text); } catch (e) {
      if (!(e instanceof Unreadable)) throw e;
      findings.push(`${rel} cannot be read whole by the census (${e.message}) -- fail closed, a file it cannot read may hide a git spawn (CWK-136)`);
      continue;
    }
    for (const call of ctx.calls) {
      if (call.args === null) {
        if (isGitCommand(ctx.toks[call.open + 1] && ctx.toks[call.open + 1].t === 'str' ? ctx.toks[call.open + 1].v : '')) { spawns++; findings.push(`${rel}:${lineOf(text, ctx.toks[call.k].s)} unbalanced parens scanning a ${call.callee}('git', ...) call -- census cannot verify it`); }
        continue;
      }
      const [s, e] = call.args[0];
      const first = ctx.toks[s];
      if (e - s !== 1 || !(first.t === 'str' || first.t === 'tpl') || !isGitCommand(first.v)) continue;
      spawns++;
      const why = spawnRefusal(ctx, call);
      if (why) findings.push(`${rel}:${lineOf(text, ctx.toks[call.k].s)} ${call.callee}('git', ...) ${why}`);
    }
  }
  return { findings, spawns, files: files.length };
}

// Real filesystem walk of scripts/**/*.mjs and hooks/*.js, `rel` relative to `repo`.
export function collectSources(repo) {
  const files = [];
  const walk = (d, test) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'fixtures' && e.name !== 'node_modules') walk(p, test); }
      else if (test(e.name)) files.push({ rel: path.relative(repo, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') });
    }
  };
  walk(path.join(repo, 'scripts'), (n) => n.endsWith('.mjs'));
  walk(path.join(repo, 'hooks'), (n) => n.endsWith('.js'));
  return files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}
