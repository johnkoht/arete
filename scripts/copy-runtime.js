#!/usr/bin/env node
/**
 * Copy runtime assets (skills, tools, rules, integrations, templates) into dist/
 * so the published package has dist/skills/, dist/templates/, etc.
 * Run after tsc during build.
 */

import { cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const runtime = join(root, 'packages', 'runtime');
const dist = join(root, 'dist');

const DIRS = ['skills', 'tools', 'rules', 'integrations', 'templates'];

if (!existsSync(runtime)) {
  console.error('packages/runtime/ not found; run from package root');
  process.exit(1);
}

if (!existsSync(dist)) {
  console.error('dist/ not found; run tsc first');
  process.exit(1);
}

for (const dir of DIRS) {
  const src = join(runtime, dir);
  const dest = join(dist, dir);
  if (!existsSync(src)) continue;
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

// Copy GUIDE.md to dist root
const guideSrc = join(runtime, 'GUIDE.md');
const guideDest = join(dist, 'GUIDE.md');
if (existsSync(guideSrc)) {
  cpSync(guideSrc, guideDest);
  console.log('Copied GUIDE.md to dist/');
}

console.log('Copied packages/runtime/ to dist/');
