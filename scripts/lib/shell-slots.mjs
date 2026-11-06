// 29ck: no value on a command line in shipped text, except a slot that names the skill's own folder. findShellSlots(text) reports each value slot on a
// command span: an inline code span or a fenced line whose first command word is a shell runner. Read-only and zero-dep: it never runs or imports the text it reads.
// Shell variables the shell itself owns ($HOME, %TEMP% and similar) are not slots.
// It sees only the spans and fences the text marks as code: prose that names a command with no code span is not seen.

const RUNNERS = 'node|npx|npm|pnpm|yarn|bun|deno|python3?|pip3?|uvx?|bash|sh|zsh|pwsh|powershell|cmd|git|gh|curl|wget|rtk|claude|agy|cd|cp|mv|rm|mkdir|cat|grep|sed|awk|find|tar|unzip|sui|cargo|go';
const COMMAND = new RegExp(`(^|[\\s;&|(])(${RUNNERS})(\\.exe)?\\s`);

// Each slot shape, with the name it carries in group 1. The brace shape skips a `${...}`, which the dollar shape already reads.
const SLOT_SHAPES = [
  { kind: 'angle', re: /<([A-Za-z][^<>`\n]*)>/g },
  { kind: 'brace', re: /(?<!\$)\{\{?([A-Za-z_][\w. -]*)\}?\}/g },
  { kind: 'dollar', re: /\$\{?([A-Za-z_]\w*)\}?/g },
  { kind: 'percent', re: /%([A-Za-z_]\w*)%/g },
  { kind: 'flag', re: /--[\w-]+=([A-Z][A-Z0-9_]{2,})\b/g },
  { kind: 'repeat', re: /\[([A-Za-z][A-Za-z -]*)\.\.\.\]/g },
];
// Names a shell or the platform owns; a `$NAME` or `%NAME%` of these is not a value the agent fills in.
const SHELL_OWN = /^(HOME|PWD|OLDPWD|PATH|TMPDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/;
// The skill's own folder, named in a slot: the one slot the rule allows.
const SKILL_FOLDER = /skill[\s_-]*(folder|dir|root|base)/i;

function scanCommand(span, line, hits) {
  if (!COMMAND.test(span)) return;
  for (const { kind, re } of SLOT_SHAPES) {
    for (const m of span.matchAll(re)) {
      const name = m[1] ?? '';
      if ((kind === 'dollar' || kind === 'percent') && SHELL_OWN.test(name)) continue;
      if (SKILL_FOLDER.test(name)) continue;
      hits.push({ line, span: span.trim(), slot: m[0], kind });
    }
  }
}

// Returns one row per value slot on a shell line: { line (1-based), span (the command text), slot (the matched slot), kind }.
export function findShellSlots(text) {
  const hits = [];
  const lines = String(text).split(/\r?\n/);
  let fence = null; // { char, len } while inside a fenced block
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    if (fence) {
      const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(raw);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
      else scanCommand(raw, lineNo, hits);
      return;
    }
    const open = /^\s{0,3}(`{3,}|~{3,})/.exec(raw);
    if (open) { fence = { char: open[1][0], len: open[1].length }; return; }
    for (const m of raw.matchAll(/`([^`\n]+)`/g)) scanCommand(m[1], lineNo, hits);
  });
  return hits;
}
