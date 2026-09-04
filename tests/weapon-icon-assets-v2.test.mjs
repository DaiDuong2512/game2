import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const weapons = JSON.parse(await readFile(new URL('public/data/weapons.json', root), 'utf8'));
const upgrades = JSON.parse(await readFile(new URL('public/data/upgrades.json', root), 'utf8'));
const passives = JSON.parse(await readFile(new URL('public/data/passives.json', root), 'utf8'));

const weaponIconPattern = /^assets\/generated\/weapons\/([a-z0-9-]+)-v2\.png$/u;

test('14 vũ khí dùng 14 icon v2 riêng, chuẩn PNG 256×256 RGBA', async () => {
  assert.equal(weapons.length, 14);
  assert.equal(new Set(weapons.map((weapon) => weapon.id)).size, 14);
  assert.equal(new Set(weapons.map((weapon) => weapon.icon)).size, 14);

  const hashes = new Set();
  for (const weapon of weapons) {
    assert.match(weapon.icon, weaponIconPattern, `${weapon.id} phải dùng icon v2`);
    assert.equal(weapon.icon, `assets/generated/weapons/${weapon.id}-v2.png`);

    const png = await readFile(new URL(`public/${weapon.icon}`, root));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', `${weapon.id} thiếu PNG`);
    assert.equal(png.readUInt32BE(16), 256, `${weapon.id} phải rộng 256 px`);
    assert.equal(png.readUInt32BE(20), 256, `${weapon.id} phải cao 256 px`);
    assert.equal(png[24], 8, `${weapon.id} phải dùng kênh màu 8-bit`);
    assert.equal(png[25], 6, `${weapon.id} phải là PNG RGBA`);
    hashes.add(createHash('sha256').update(png).digest('hex'));
  }

  assert.equal(hashes.size, 14, 'không icon vũ khí nào được dùng lại nội dung ảnh');
});

test('nâng cấp và nội tại không còn tham chiếu icon vũ khí cũ', () => {
  const records = [...upgrades.statBoosts, ...passives];
  const weaponIcons = records
    .map((record) => record.icon)
    .filter((icon) => typeof icon === 'string' && icon.includes('assets/generated/weapons/'));

  assert.ok(weaponIcons.length > 0);
  for (const icon of weaponIcons) {
    assert.match(icon, weaponIconPattern, `${icon} phải trỏ tới phiên bản v2`);
  }
});
