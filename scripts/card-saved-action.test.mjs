import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../map-experience.css', import.meta.url), 'utf8');
const controls = fs.readFileSync(new URL('../stitch-controls.js', import.meta.url), 'utf8');

test('PC 카드에서 담은 기관 보기 동작과 축소된 담기 폭을 명확히 표시한다', () => {
  assert.match(html, /data-popup-saved aria-label="담은 기관 보기"><span>담은기관<br>보기<\/span><\/button>/);
  assert.match(html, /map-experience\.css\?v=20261127-saved-label1/);
  assert.match(css, /grid-template-columns:70px minmax\(0,1fr\)/);
  assert.match(css, /button:last-child > span \{[^}]*line-height:1\.15/);
});

test('전화번호를 카드에 표시하고 한 번 누르면 실제 tel 링크로 연결한다', () => {
  assert.match(html, /stitch-controls\.js\?v=20261126-phone-one-tap1/);
  assert.match(controls, /link\.href = `tel:\$\{number\}`/);
  assert.match(controls, /link\.textContent = `\$\{phone\} 전화하기`/);
  assert.match(controls, /root\.location\.href = hydrated\.href/);
});

test('동적 목록에도 전화 링크를 채우고 미공개·실패 상태를 구분한다', () => {
  assert.match(controls, /new MutationObserver\(hydratePhones\)/);
  assert.match(controls, /전화번호 미공개/);
  assert.match(controls, /전화번호 다시 확인/);
  assert.match(controls, /care:phone-click/);
});
