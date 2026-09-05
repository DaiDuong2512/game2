import { build, transform } from 'esbuild';
import sharp from 'sharp';
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

async function filesUnder(directory) {
  const paths = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) paths.push(...await filesUnder(full));
    else paths.push(full);
  }
  return paths;
}

export async function compactRelease(directory) {
  // Caller supplies the verified staging directory; never operate on the source tree.
  if (path.basename(directory) !== 'dist.__build__') throw new Error('Expected dist staging directory');
  await build({ entryPoints: [path.join(directory, 'src/main.js')], outfile: path.join(directory, 'app.js'),
    bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'none', sourcemap: false });
  const textPaths = ['app.js', 'index.html', 'styles.css', ...(await readdir(path.join(directory, 'data'))).map(f => `data/${f}`)];
  const texts = new Map(await Promise.all(textPaths.map(async f => [f, await readFile(path.join(directory, f), 'utf8')])));
  texts.set('index.html', texts.get('index.html').replace('./src/main.js', './app.js'));
  texts.set('styles.css', (await transform(texts.get('styles.css'), { loader: 'css', minify: true })).code);
  const used = new Set();
  for (const content of texts.values()) for (const match of content.matchAll(/assets\/[\w./-]+\.(?:png|jpg|jpeg)/g)) used.add(match[0]);
  const mapping = new Map();
  let next = 0;
  const assets = [...used].sort();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < assets.length) {
      const original = assets[next++];
      const compressed = original.replace(/\.(png|jpg|jpeg)$/, '.webp');
      const exactPixels = /gameplay|effects\/|bosses-v|combat-v8\/(?!ground)|terrain-v/.test(original);
      let pipeline = sharp(path.join(directory, original));
      // Large legacy fallbacks/decorations render at 50–250 px. Keep the new
      // boss/effect animation atlas resolution; resize only oversized UI/props.
      const width = /guardian-passive|bosses-v2/.test(original) ? 1024
        : /terrain-props/.test(original) ? 768
          : /terrain-grass/.test(original) ? 512
            : /bosses-v3/.test(original) ? 512
              : /titan-actions/.test(original) ? 1152 : 0;
      if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true, kernel: 'nearest' });
      else if (/stages\//.test(original)) pipeline = pipeline.resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true });
      else if (/characters\//.test(original) && !/gameplay|walk-8dir/.test(original)) pipeline = pipeline.resize({ width: 384, height: 384, fit: 'inside', withoutEnlargement: true });
      await pipeline.webp(exactPixels
        ? { lossless: true, effort: 5 } : { quality: 84, alphaQuality: 100, effort: 5 }).toFile(path.join(directory, compressed));
      mapping.set(original, compressed);
    }
  }));
  for (const [file, original] of texts) {
    let content = original;
    for (const [from, to] of mapping) content = content.replaceAll(from, to);
    if (file === 'index.html') content = content.replace('type="image/png"', 'type="image/webp"');
    if (file.endsWith('.json')) content = JSON.stringify(JSON.parse(content));
    await writeFile(path.join(directory, file), content);
  }
  const keep = new Set(mapping.values());
  for (const file of await filesUnder(path.join(directory, 'assets'))) {
    if (!keep.has(path.relative(directory, file).replaceAll('\\', '/'))) await rm(file);
  }
  const compiled = path.resolve(directory, 'src');
  if (path.dirname(compiled) !== path.resolve(directory)) throw new Error('Unsafe output path');
  await rm(compiled, { recursive: true });
  await writeFile(path.join(directory, '.nojekyll'), '');
  const infoPath = path.join(directory, 'build-info.json');
  const info = JSON.parse(await readFile(infoPath, 'utf8'));
  info.compact = true;
  info.assetCount = keep.size;
  info.assets = 'WebP with alpha; lossless encoding for animation/effects, oversized legacy props and UI resized for runtime';
  await writeFile(infoPath, JSON.stringify(info, null, 2));
  const output = (await filesUnder(directory)).sort();
  const manifest = [];
  let bytes = 0;
  for (const file of output) {
    const buffer = await readFile(file);
    bytes += buffer.length;
    manifest.push(`${createHash('sha256').update(buffer).digest('hex')}  ${path.relative(directory, file).replaceAll('\\', '/')}`);
  }
  await writeFile(path.join(directory, 'RELEASE_MANIFEST.sha256'), manifest.join('\n') + '\n');
  console.log(`Compact release: ${output.length} files, ${keep.size} assets, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
}
