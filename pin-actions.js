const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');

const PINNED = new Map([
  ['actions/checkout@v4', 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4'],
  ['actions/setup-node@v4', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4'],
  ['actions/upload-artifact@v4', 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4'],
  ['actions/download-artifact@v4', 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4']
]);

function isPinned(value) {
  if (value.startsWith('./')) return true;
  if (value.startsWith('docker://')) return /@sha256:[a-f0-9]{64}$/i.test(value);
  const at = value.lastIndexOf('@');
  if (at < 0) return false;
  return /^[a-f0-9]{40}$/i.test(value.slice(at + 1));
}

function main() {
  const files = fs.readdirSync(WORKFLOW_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => path.join(WORKFLOW_DIR, name));

  const changed = [];
  const unknownUnpinned = [];

  for (const full of files) {
    const relative = path.relative(ROOT, full).replace(/\\/g, '/');
    const original = fs.readFileSync(full, 'utf8');
    const lines = original.split(/\r?\n/);
    let touched = false;

    const next = lines.map((line, index) => {
      const match = line.match(/^(\s*uses:\s*)([^\s#]+)(\s*(?:#.*)?)$/);
      if (!match) return line;
      const prefix = match[1];
      const value = match[2];

      if (isPinned(value)) return line;

      const replacement = PINNED.get(value);
      if (replacement) {
        touched = true;
        return `${prefix}${replacement}`;
      }

      if (!value.startsWith('./')) {
        unknownUnpinned.push({ file: relative, line: index + 1, action: value });
      }
      return line;
    });

    if (touched) {
      fs.writeFileSync(full, next.join('\n'), 'utf8');
      changed.push(relative);
    }
  }

  console.log(`Pinned workflow files changed: ${changed.length}`);
  for (const file of changed) console.log(`- ${file}`);

  if (unknownUnpinned.length) {
    console.error('Unknown unpinned external Actions remain:');
    for (const item of unknownUnpinned) console.error(`- ${item.file}:${item.line} ${item.action}`);
    process.exit(2);
  }

  console.log('All external workflow Actions are pinned or locally referenced.');
}

main();
