/** SOFTM-DETAIL-SPECIALTIES START 날짜:20261121 : 실제 기관 상세에서 조건 없는 특화 노출·펼침·좁은 화면을 검증 */
import assert from 'node:assert/strict';

export async function verifyDetailSpecialties(page, { expected, out, name, width }) {
 const section = page.locator('#detailDecision .care-detail-features');
 const actual = await page.locator('#detailDecision .care-feature-badges>li').allTextContents();
 assert.deepEqual(actual, expected, '실제 공단 자료에 있는 특화 전체를 기본 노출');
 assert.equal(await page.evaluate(() => sessionStorage.getItem('careMatch:v1')), null, '맞춤조건을 선택하지 않아도 상세 특화 표시');
 if (!expected.length) {
  assert.equal(await section.count(), 0, '미등재·자료 실패·의료기관에는 빈 특화 영역 미표시');
  assert.doesNotMatch(await page.locator('#detailDecision').innerText(), /특화 없음|특화 미제공/);
  return { labels: actual, section: false };
 }
 assert.match(await section.locator('.care-feature-source').innerText(), /공단 기관검색.*2026-09-04/);
 const guide = section.locator('details'), toggle = guide.locator('summary');
 assert.equal(await guide.evaluate(e => e.open), false, '세부 유형만 기본 접힘');
 await section.scrollIntoViewIfNeeded();
 const metrics = await section.evaluate(element => {
  const rect = element.getBoundingClientRect();
  return {
   width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
   badges: [...element.querySelectorAll('.care-feature-badges>li')].map(badge => {
    const style = getComputedStyle(badge), box = badge.getBoundingClientRect();
    return { fontSize: parseFloat(style.fontSize), overflow: badge.scrollWidth > badge.clientWidth + 1, clipped: box.left < rect.left || box.right > rect.right + 1, ellipsis: style.textOverflow === 'ellipsis' };
   })
  };
 });
 assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, '특화 영역 가로 넘침 없음');
 assert.ok(metrics.badges.every(badge => badge.fontSize >= 14 && !badge.overflow && !badge.clipped && !badge.ellipsis), '모든 특화명은 읽을 수 있는 크기·줄바꿈으로 표시');
 await section.screenshot({ path: `${out}/${name}-${width}-features.png`, animations: 'disabled' });
 await toggle.click();
 assert.equal(await guide.evaluate(e => e.open), true, '세부 유형 마우스 펼침');
 assert.equal(await guide.locator('li').count(), expected.length, '특화별 세부 유형 제공');
 for (const service of await guide.locator('li span').all()) assert.ok((await service.innerText()).trim(), '실제 급여 세부 유형 표시');
 assert.match(await guide.innerText(), /현재 이용 대상·운영 일정은 기관에 확인/);
 await guide.screenshot({ path: `${out}/${name}-${width}-feature-guide.png`, animations: 'disabled' });
 await toggle.focus(); await page.keyboard.press('Enter');
 assert.equal(await guide.evaluate(e => e.open), false, '키보드로 세부 유형 접기');
 return { labels: actual, section: true, metrics };
}
/** SOFTM-DETAIL-SPECIALTIES END */
