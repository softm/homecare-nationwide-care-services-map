import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../stitch-desktop.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('PC 검색 패널은 지역 선택을 검색어 입력보다 위에 배치한다', () => {
  const rule = css.match(/SOFTM-REGION-BEFORE-SEARCH START[\s\S]*?SOFTM-REGION-BEFORE-SEARCH END/)?.[0] ?? '';
  assert.match(rule, /grid-template-columns:minmax\(0,1fr\) 58px 78px/);
  assert.match(rule, /#province,[\s\S]*#city\s*\{\s*grid-column:1\/-1;\s*grid-row:1;/);
  assert.match(rule, /\.care-voice-input\s*\{\s*grid-column:1;\s*grid-row:2;/);
  assert.match(rule, /\.search-btn\s*\{\s*grid-column:2;\s*grid-row:2;/);
  assert.match(rule, /\.care-mobile-filter-toggle\s*\{\s*grid-column:3;\s*grid-row:2;/);
  assert.match(html, /stitch-desktop\.css\?v=20261118-compact-search-actions1/);
});
