// Guards .claude/agents/ layout. Claude Code walks that directory recursively under a hard
// 3-second budget and silently drops whatever it has not reached, so any subdirectory there
// makes project agents intermittently vanish ("Agent type 'pm-agent' not found"), and any
// extra .md with a `name:` frontmatter registers as a stray agent.
// Rule: .claude/agents/ holds only <name>.md files whose frontmatter `name` equals <name>.
// Agent method files (SKILL.md, references/) live in .claude/agent-methods/<name>/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', '.claude', 'agents');
const errors = [];

for (const entry of readdirSync(dir, { withFileTypes: true })) {
  const path = `.claude/agents/${entry.name}`;
  if (!entry.isFile()) {
    errors.push(`${path}: must not be a directory — move it to .claude/agent-methods/`);
    continue;
  }
  if (!entry.name.endsWith('.md')) {
    errors.push(`${path}: only .md agent files belong here`);
    continue;
  }
  const text = readFileSync(join(dir, entry.name), 'utf8').replace(/^﻿/, '');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const name = frontmatter && /^name:\s*(\S+)\s*$/m.exec(frontmatter)?.[1];
  if (name !== entry.name.slice(0, -3)) {
    errors.push(`${path}: frontmatter name '${name}' must equal the file name`);
  }
  if (!frontmatter || !/^description:/m.test(frontmatter)) {
    errors.push(`${path}: frontmatter needs a description`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('.claude/agents/ OK — flat, names match file names');
