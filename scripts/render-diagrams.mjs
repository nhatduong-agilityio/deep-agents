#!/usr/bin/env node
/**
 * Extracts every mermaid code block from docs/diagrams/*.md
 * and renders each one to docs/diagrams/img/<file>-<n>.svg via mmdc.
 *
 * Usage: pnpm diagrams
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';

const DIAGRAMS_DIR = 'docs/diagrams';
const OUT_DIR = 'docs/diagrams/img';
const MERMAID_RE = /```mermaid\r?\n([\s\S]*?)```/g;

const mdFiles = readdirSync(DIAGRAMS_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort();

let rendered = 0;
let failed = 0;

for (const mdFile of mdFiles) {
  const content = readFileSync(join(DIAGRAMS_DIR, mdFile), 'utf8');
  const prefix = basename(mdFile, '.md');
  let blockIndex = 0;
  let match;

  MERMAID_RE.lastIndex = 0;
  while ((match = MERMAID_RE.exec(content)) !== null) {
    blockIndex++;
    const tmpFile = join(tmpdir(), `${randomUUID()}.mmd`);
    const outFile = join(OUT_DIR, `${prefix}-${blockIndex}.svg`);

    writeFileSync(tmpFile, match[1]);
    process.stdout.write(`  ${mdFile} [${blockIndex}] → img/${prefix}-${blockIndex}.svg\n`);

    try {
      execSync(`mmdc -i "${tmpFile}" -o "${outFile}"`, { stdio: 'inherit' });
      rendered++;
    } catch {
      process.stderr.write(`  FAILED: ${mdFile} block ${blockIndex}\n`);
      failed++;
    }
  }
}

process.stdout.write(`\nDone — ${rendered} rendered, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
