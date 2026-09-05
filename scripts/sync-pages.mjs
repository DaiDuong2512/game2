import { readFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const verify = spawnSync(process.execPath, ['scripts/verify-release.mjs', dist], { cwd: root, stdio: 'inherit' });
if (verify.status !== 0) process.exit(verify.status ?? 1);
const manifest = await readFile(path.join(dist, 'RELEASE_MANIFEST.sha256'), 'utf8');
const files = manifest.trim().split('\n').map(line => line.split('  ')[1]);
files.push('RELEASE_MANIFEST.sha256');
const allowed = file => /^(assets\/|data\/|app\.js$|index\.html$|styles\.css$|build-info\.json$|\.nojekyll$|RELEASE_MANIFEST\.sha256$)/.test(file);
for (const file of files) {
  const target = path.resolve(root, file);
  if (!allowed(file) || !target.startsWith(root + path.sep)) throw new Error(`Unsafe deployment path: ${file}`);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(dist, file), target);
}
// The previous upload placed compiler output beside TypeScript sources.
// Replace only those tracked JS/map outputs; retain all source files and history.
const tracked = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'ls-files', 'src'], { cwd: root, encoding: 'utf8' });
if (tracked.status !== 0) throw new Error(tracked.stderr);
let removed = 0;
for (const file of tracked.stdout.trim().split('\n').filter(f => /\.js(?:\.map)?$/.test(f))) {
  const target = path.resolve(root, file);
  if (!target.startsWith(path.join(root, 'src') + path.sep)) throw new Error('Unsafe legacy output path');
  await rm(target, { force: true });
  removed++;
}
console.log(`GitHub Pages root prepared: ${files.length} release files; ${removed} old compiled files replaced by app.js.`);
