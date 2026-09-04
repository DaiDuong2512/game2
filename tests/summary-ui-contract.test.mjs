import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [uiSource, cssSource] = await Promise.all([
  readFile(new URL('../src/ui/UIManager.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
]);

function methodBody(source, methodName, nextMethodName) {
  const start = source.indexOf(`public ${methodName}`);
  const end = source.indexOf(`public ${nextMethodName}`, start);
  assert.ok(start >= 0 && end > start, `expected ${methodName} before ${nextMethodName}`);
  return source.slice(start, end);
}

function balancedBlocks(source, headerPattern) {
  const blocks = [];
  for (const match of source.matchAll(headerPattern)) {
    const openingBrace = source.indexOf('{', match.index);
    let depth = 0;
    for (let index = openingBrace; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      if (depth === 0) {
        blocks.push(source.slice(match.index, index + 1));
        break;
      }
    }
  }
  return blocks;
}

const summary = methodBody(uiSource, 'showSummary', 'showMissionBriefing');

test('end-run summary exposes one labelled result landmark', () => {
  const landmark = summary.match(
    /<section\b(?=[^>]*class="[^"]*\bsummary-screen\b[^"]*")[^>]*>/u,
  )?.[0];
  assert.ok(landmark, 'summary needs a stable screen-level hook');
  assert.match(landmark, /aria-labelledby="summary-result-title"/u);
  assert.match(summary, /<h1 id="summary-result-title">/u);
  assert.match(summary, /class="[^"]*\bresult-banner\b[^"]*\$\{victory/u);
  assert.equal(
    (summary.match(/id="summary-result-title"/gu) ?? []).length,
    1,
    'the result title id must remain unique',
  );
});

test('run metrics use descriptive list semantics without constraining their visual order', () => {
  const statGrid = summary.match(
    /<dl\b(?=[^>]*class="[^"]*\brun-stat-grid\b[^"]*")(?=[^>]*aria-label="Chỉ số trận đấu")[^>]*>[\s\S]*?<\/dl>/u,
  )?.[0];

  assert.ok(statGrid, 'summary must expose a labelled metric list');
  const terms = statGrid.match(/<dt>/gu) ?? [];
  const values = statGrid.match(/<dd>/gu) ?? [];
  assert.ok(terms.length >= 4, 'the compact summary must retain at least four key metrics');
  assert.equal(values.length, terms.length, 'every metric label needs one value');
  assert.doesNotMatch(statGrid, /<span>|<strong>/u, 'metric meaning must not depend on styling tags');
});

test('secondary damage data stays progressively disclosed with a native details control', () => {
  assert.match(
    summary,
    /<details class="panel summary-panel damage-breakdown">\s*<summary>[^<]+<\/summary>\s*<div class="damage-list">/u,
  );
  assert.doesNotMatch(
    summary,
    /<details[^>]*\sopen(?:\s|>|=)/u,
    'secondary damage rows should not expand the first viewport by default',
  );
});

test('victory reward region and choices have explicit accessible names', () => {
  const rewardRegion = summary.match(
    /<section\b(?=[^>]*class="[^"]*\bpermanent-reward-block\b[^"]*")[^>]*>/u,
  )?.[0];
  assert.ok(rewardRegion, 'victory rewards need their own region');
  assert.match(rewardRegion, /aria-labelledby="permanent-reward-title"/u);
  assert.match(summary, /<h2 id="permanent-reward-title">/u);
  assert.match(
    uiSource,
    /<button type="button" class="upgrade-select" data-permanent="[^\n]+aria-label="Lựa chọn \$\{index \+ 1\}:/u,
  );
});

test('summary layout owns compact desktop and mobile responsive hooks', () => {
  assert.match(cssSource, /\.summary-screen\s+\.summary-content\s*\{/u);
  assert.match(cssSource, /\.summary-screen\s+\.summary-grid\s*\{/u);
  assert.match(cssSource, /\.summary-screen\s+\.permanent-reward-block\s*\{/u);

  const mobileBlocks = balancedBlocks(cssSource, /@media\s*\(max-width:\s*560px\)/gu);
  assert.ok(mobileBlocks.length > 0, 'a phone breakpoint must exist');
  assert.ok(
    mobileBlocks.some((block) => /\.summary-screen\s+\.summary-content/u.test(block)),
    'phone layout must compact the summary content explicitly',
  );
  assert.ok(
    mobileBlocks.some((block) => /\.summary-screen\s+\.run-stat-grid/u.test(block)),
    'phone layout must define the metric grid explicitly',
  );
  assert.ok(
    mobileBlocks.some((block) => /\.summary-screen\s+\.permanent-grid/u.test(block)),
    'phone layout must define reward-card stacking explicitly',
  );
});
