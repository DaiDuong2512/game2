import { cp, mkdir, rm, copyFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const staging = path.join(root, 'dist.__build__');
const localTsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const hasLocalTsc = existsSync(localTsc);
const tsc = hasLocalTsc ? process.execPath : (process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

const tscArgs = hasLocalTsc
  ? [localTsc, '-p', path.join(root, 'tsconfig.json'), '--outDir', staging]
  : ['-p', path.join(root, 'tsconfig.json'), '--outDir', staging];
const result = spawnSync(tsc, tscArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});
if (result.error) {
  await rm(staging, { recursive: true, force: true });
  console.error('Không tìm thấy TypeScript compiler. Hãy chạy npm install trước.');
  process.exit(1);
}
if (result.status !== 0) {
  await rm(staging, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

await copyFile(path.join(root, 'index.html'), path.join(staging, 'index.html'));
await copyFile(path.join(root, 'src', 'styles.css'), path.join(staging, 'styles.css'));
await cp(path.join(root, 'public'), staging, { recursive: true });
await writeFile(
  path.join(staging, 'build-info.json'),
  JSON.stringify({ version: '4.0.2', builtAt: new Date().toISOString() }, null, 2),
  'utf8',
);
await rm(dist, { recursive: true, force: true });
await rename(staging, dist);
console.log(`Đã tạo bản dựng Riftwarden: Echo Siege -> ${dist}`);
