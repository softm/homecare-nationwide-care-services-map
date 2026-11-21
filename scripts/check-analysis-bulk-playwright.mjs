/** SOFTM-BULK-CANDIDATES START 날짜:20261122 : 실제 검색 결과의 일괄 보관·거리순 비교·빈 필터를 숨김 브라우저에서 조작 검증 */
import assert from 'node:assert/strict';

export async function verifyAnalysisBulk(page, {out, width}) {
    await page.waitForFunction(() => document.querySelector('#analysisAddress').value.length > 0, {}, {timeout:20000});
    const previous = await page.evaluate(async () => {
        const rows = await CareData.category('daycare');
        const id = String(rows.find(row => row.a?.startsWith('부산')).i);
        sessionStorage.setItem('careCompare:v1:daycare', JSON.stringify([id]));
        sessionStorage.setItem('careCompareActive:v1:daycare', JSON.stringify([id]));
        sessionStorage.setItem('careCompare:v1:facility', JSON.stringify(['other-type-kept']));
        return id;
    });
    await page.locator('#analysisCriteria input[value="evaluation-ab"]').check();
    await page.locator('#analysisRun').click();
    await page.locator('[data-analysis-save]').first().waitFor({timeout:45000});
    const allButton = page.locator('[data-analysis-save-all]');
    const nearestButton = page.locator('[data-analysis-compare-nearest]');
    const nearbyButton = page.locator('[data-analysis-view=nearby]');
    const ids = () => page.locator('.analysis-card').evaluateAll(cards => cards.map(card => card.dataset.institutionId));
    const read = () => page.evaluate(() => ({saved:JSON.parse(sessionStorage.getItem('careCompare:v1:daycare')),active:JSON.parse(sessionStorage.getItem('careCompareActive:v1:daycare'))}));
    const back = () => page.locator('[data-analysis-panel=compare] [data-analysis-go=candidates]').first().click();
    const total = Number((await nearbyButton.textContent()).match(/(\d+)곳/)[1]);
    const visible = await ids();
    assert.ok(total > 12 && visible.length === 12, '처음 표시한 12곳 이후에도 후보가 있는 실제 검색 결과');
    assert.equal(await nearestButton.textContent(), '가까운 3곳 바로 비교');
    await nearestButton.click();
    assert.equal(await page.locator('body').getAttribute('data-analysis-step'), 'compare');
    assert.deepEqual((await read()).active, visible.slice(0,3), '개별 담기 없이 거리순 3곳 비교');
    assert.deepEqual((await read()).saved, [previous,...visible.slice(0,3)], '먼저 담은 다른 지역 기관 보존');
    await back();
    await allButton.click();
    let state = await read();
    assert.equal(state.saved.length, total+1, '더보기 이후 후보도 포함해 전체 담기');
    assert.equal(new Set(state.saved).size, state.saved.length, '이미 담은 기관 중복 없음');
    assert.equal(state.saved[0], previous, '기존 보관 순서 유지');
    assert.deepEqual(state.active, visible.slice(0,3), '전체 담기 시 기존 비교 선택 유지');
    assert.ok(await allButton.isDisabled(), '전체 담은 뒤 중복 작업 방지');
    await allButton.evaluate(button => button.click());
    assert.deepEqual(await read(), state, '반복 동작에도 상태 보존');
    const remove = page.locator('[data-analysis-save]').nth(5);
    const removedId = await remove.getAttribute('data-analysis-save');
    await remove.click();
    assert.ok(!(await read()).saved.includes(removedId));
    assert.ok(await allButton.isEnabled(), '개별 해제 후 일괄 담기 재활성화');
    await allButton.click();
    state = await read();
    assert.equal(state.saved.length, total+1);
    assert.deepEqual(state.active, visible.slice(0,3));
    await allButton.scrollIntoViewIfNeeded();
    await page.locator('.analysis-bulk-actions').screenshot({path:`${out}/analysis-bulk-${width}-actions.png`,animations:'disabled'});

    await page.locator('[data-analysis-view=confirmed]').click();
    const confirmed = await ids();
    assert.ok(confirmed.length >= 2, '실제 A·B등급 후보 확보');
    await nearestButton.click();
    assert.deepEqual((await read()).active, confirmed.slice(0,3), '조건 필터 안에서 거리순 비교');
    assert.deepEqual((await read()).saved, state.saved, '비교 전환 시 전체 보관 목록 유지');
    await back();

    // 최신 정보 응답만 가상 처리하며 운영 기관·상담 자료는 수정하지 않음.
    let recent = [];
    await page.route('**/api/public/service-facts', route => route.fulfill({status:200,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://homecare.designboard.net'},body:JSON.stringify({data:recent.map(institutionId=>({institutionId,recent:true}))})}));
    const filter = async values => {
        recent = values;
        await nearbyButton.click();
        await page.locator('[data-analysis-view=recent]').click();
        await page.waitForFunction(() => document.querySelector('[data-analysis-view=recent]').getAttribute('aria-pressed') === 'true');
    };
    await filter([]);
    assert.equal((await ids()).length, 0);
    assert.ok(await allButton.isDisabled() && await nearestButton.isDisabled(), '0곳 필터에서 담기·비교 불가');
    await filter([visible[5]]);
    assert.deepEqual(await ids(), [visible[5]]);
    assert.ok(await nearestButton.isDisabled(), '후보 1곳으로 비교하지 않음');
    await page.locator('[data-analysis-save]').click();
    await allButton.click();
    assert.equal((await read()).saved.length, total+1, '1곳 필터의 전체 담기도 기존 보관 목록 유지');
    await filter([visible[8],visible[5]]);
    assert.deepEqual(await ids(), [visible[5],visible[8]], 'API 목록 순서와 무관하게 거리순 유지');
    assert.equal(await nearestButton.textContent(), '가까운 2곳 바로 비교');
    await nearestButton.click();
    assert.deepEqual((await read()).active, [visible[5],visible[8]], '2곳 필터에서 해당 2곳만 비교');
    assert.equal((await read()).saved.length, total+1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('careCompare:v1:facility')), '["other-type-kept"]', '다른 유형의 담은 기관 유지');

    // 새 검색에서 필터 밖 기관이 몰래 담기지 않는지 확인.
    await back();
    await page.locator('[data-analysis-go=conditions]').first().click();
    await page.evaluate(id => {
        sessionStorage.setItem('careCompare:v1:daycare', JSON.stringify([id]));
        sessionStorage.setItem('careCompareActive:v1:daycare', JSON.stringify([id]));
    }, previous);
    await page.locator('#analysisRun').click();
    await page.locator('[data-analysis-save]').first().waitFor({timeout:45000});
    await filter([visible[8],visible[5]]);
    await allButton.click();
    assert.deepEqual((await read()).saved, [previous,visible[5],visible[8]], '현재 필터의 후보만 일괄 보관');
    await nearestButton.click();
    assert.deepEqual((await read()).active, [visible[5],visible[8]]);
    const persisted = await read();
    await page.reload({waitUntil:'domcontentloaded'});
    assert.deepEqual(await read(), persisted, '새로고침 뒤 저장·비교 선택 유지');
    await page.waitForFunction(() => document.querySelector('#analysisAddress').value.length > 0, {}, {timeout:20000});
    await page.locator('#analysisRun').click();
    await page.locator('[data-analysis-save]').first().waitFor({timeout:45000});
    await nearestButton.click();
    assert.deepEqual((await read()).active, visible.slice(0,3));
    return {total,initialRendered:visible.length,filters:[0,1,2,'confirmed'],previousPreserved:true,duplicates:false,persisted:true};
}
/** SOFTM-BULK-CANDIDATES END */
