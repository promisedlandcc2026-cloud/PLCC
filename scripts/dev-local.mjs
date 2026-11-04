#!/usr/bin/env node
/**
 * Starts API (:5001) + Vite (:3003) together for local preview.
 * Usage: npm run dev:all
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function run(label, args) {
  const child = spawn('npm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 200).unref?.();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting local API (:5001) and Vite (:3003)…');
console.log('Open http://localhost:3003/ when ready.\n');

run('api', ['run', 'dev:api']);
run('web', ['run', 'dev']);
