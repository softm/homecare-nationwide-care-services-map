import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../map-experience.css', import.meta.url), 'utf8');
const controls = fs.readFileSync(new URL('../stitch-controls.js', import.meta.url), 'utf8');

test('PC 카드에서 담은 기관 보기 동작과 축소된 담기 폭을 명확히 표시한다', () => {
  assert.match(html, /data-popup-saved aria-label="담은 기관 보기">담은 기관 보기<\/button>/);
  assert.match(html, /map-experience\.css\?v=20261118-saved-action-label1/);
  assert.match(css, /grid-template-columns:70px minmax\(0,1fr\)/);
});

test('전화 버튼은 즉시 진행 상태를 보이고 완료 결과를 화면 안에 표시한다', () => {
  assert.match(html, /stitch-controls\.js\?v=20261118-phone-copy1/);
  assert.match(controls, /button\.textContent = '☎ 확인 중…'/);
  assert.match(controls, /output\.scrollIntoView\(\{block:'nearest', behavior:'smooth'\}\)/);
});

test('전화번호 결과는 접근 가능한 복사 아이콘과 클립보드 대체 동작을 제공한다', () => {
  assert.match(html, /stitch-desktop\.css\?v=20261118-phone-copy1/);
  assert.match(controls, /className = 'stitch-phone-copy'/);
  assert.match(controls, /copy\.setAttribute\('aria-label', `\$\{phone\} 복사`\)/);
  assert.match(controls, /navigator\.clipboard\?\.writeText/);
  assert.match(controls, /document\.execCommand\('copy'\)/);
});
