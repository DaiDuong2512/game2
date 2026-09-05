import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] ?? 'dist');
const info = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
assert.equal(info.compact, true);
const manifest = await readFile(path.join(root, 'RELEASE_MANIFEST.sha256'), 'utf8');
const files = new Set();
let bytes = 0;
for (const line of manifest.trim().split('\n')) {
  const [hash, file] = line.split('  ');
  const resolved = path.resolve(root, file);
  assert.ok(resolved.startsWith(root + path.sep), 'manifest path must stay in release root');
  const content = await readFile(resolved);
  bytes += content.length;
  assert.equal(createHash('sha256').update(content).digest('hex'), hash, file);
  files.add(file);
}
assert.ok(files.has('.nojekyll') && files.has('app.js') && files.has('index.html'));
for (const file of files) {
  assert.ok(!file.endsWith('.map') && !file.endsWith('.ts'), `development file in release: ${file}`);
  if (!/\.(html|css|js|json)$/.test(file)) continue;
  const text = await readFile(path.join(root, file), 'utf8');
  for (const match of text.matchAll(/assets\/[\w./-]+\.(?:webp|png|jpg|jpeg)/g)) {
    assert.ok(files.has(match[0]), `missing reference ${match[0]} in ${file}`);
  }
}
assert.equal([...files].filter(f => f.startsWith('assets/')).length, info.assetCount);
console.log(`Verified ${info.version}: ${files.size} manifest entries, ${info.assetCount} assets, ${(bytes / 1048576).toFixed(2)} MiB, all references/hashes valid.`);
