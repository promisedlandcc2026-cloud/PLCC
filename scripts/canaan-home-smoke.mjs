import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const temporary = resolve('.canaan-home-smoke.tmp.mjs');
try {
  const result = await build({ entryPoints: ['scripts/canaan-home-smoke.tsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env': '{}' }, write: false });
  await writeFile(temporary, result.outputFiles[0].contents);
  const run = spawnSync(process.execPath, [temporary], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
  if (run.status !== 0) process.exitCode = run.status || 1;
} finally {
  await unlink(temporary).catch(() => {});
}
