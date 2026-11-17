/** SOFTM-COMPARE-ACTUAL-DATA START 날짜:20261118 : 예시값이 아니라 배포 압축자료의 평가연도·출처로 비교 안전정책을 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import '../care-compare-evidence.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('data/care/manifest.json', root), 'utf8'));
const nhisManifest = JSON.parse(readFileSync(new URL('data/nhis/manifest.json', root), 'utf8'));
const photoManifest = JSON.parse(readFileSync(new URL('data/care-photos/manifest.json', root), 'utf8'));
const { build, evaluation } = globalThis.CareCompareEvidence;
const load = type => JSON.parse(gunzipSync(readFileSync(new URL(`data/care/${manifest[type].file}`, root))));

test('배포 중인 9개 유형 압축자료와 매니페스트 수가 일치한다', () => {
    const nhisIds = new Set(), hiraIds = new Set();
    let serviceRows = 0, photoRows = 0;
    for (const [type, meta] of Object.entries(manifest)) {
        const rows = load(type);
        assert.equal(rows.length, meta.count, `${type}: 검색자료 개수`);
        assert.equal(photoManifest[type]?.count || 0, type === 'nursing-hospital' ? 0 : rows.length, `${type}: 사진 매니페스트 개수`);
        rows.forEach(row => (meta.source === 'hira' ? hiraIds : nhisIds).add(String(row.i)));
        serviceRows += rows.length;
        photoRows += photoManifest[type]?.withPhotos || 0;
    }
    assert.equal(serviceRows, Object.values(manifest).reduce((sum, meta) => sum + meta.count, 0));
    assert.equal(nhisIds.size, nhisManifest.catalogCount);
    assert.equal(hiraIds.size, manifest['nursing-hospital'].count);
    assert.equal(photoRows, Object.values(photoManifest).reduce((sum, meta) => sum + (meta.withPhotos || 0), 0));
    assert.ok(serviceRows > 30000 && photoRows > 30000, '전국 단위 실제 자료를 사용');
});

test('실제 혼합 평가연도 유형은 점수·등급 정렬을 허용하지 않는다', () => {
    for (const type of ['facility', 'daycare', 'home-care', 'home-nursing', 'home-bath', 'short-stay', 'welfare-equipment', 'dementia']) {
        const rows = load(type).filter(row => evaluation(row).evaluated && evaluation(row).year);
        const byYear = new Map();
        rows.forEach(row => {
            const year = evaluation(row).year;
            if (!byYear.has(year)) byYear.set(year, row);
        });
        assert.ok(byYear.size > 1, `${type}: 실제 혼합 평가연도 표본`);
        const policy = build([...byYear.values()].slice(0, 2), { source: manifest[type].source, sourceDate: manifest[type].sourceDate });
        assert.equal(policy.canRankEvaluation, false, `${type}: 혼합연도 순위 차단`);
        assert.deepEqual(policy.defaultSort, { key: 'name', dir: 'asc' }, `${type}: 안전한 기본 정렬`);
    }
});

test('실제 같은 평가연도 표본만 점수·등급 정렬을 허용한다', () => {
    for (const type of ['facility', 'daycare', 'home-care', 'home-nursing', 'home-bath', 'short-stay', 'welfare-equipment', 'dementia']) {
        const groups = new Map();
        load(type).filter(row => evaluation(row).evaluated && evaluation(row).year).forEach(row => {
            const year = evaluation(row).year;
            if (!groups.has(year)) groups.set(year, []);
            if (groups.get(year).length < 2) groups.get(year).push(row);
        });
        const pair = [...groups.values()].find(rows => rows.length === 2);
        assert.ok(pair, `${type}: 같은 연도 평가 표본`);
        assert.equal(build(pair, { source: 'nhis' }).canRankEvaluation, true, `${type}: 같은 연도 순위 허용`);
    }
});

test('실제 요양병원 자료에는 공단 평가 순위를 적용하지 않는다', () => {
    const rows = load('nursing-hospital').slice(0, 2);
    assert.equal(rows.length, 2);
    const policy = build(rows, { source: manifest['nursing-hospital'].source, sourceDate: manifest['nursing-hospital'].sourceDate });
    assert.equal(policy.source, 'hira');
    assert.equal(policy.canRankEvaluation, false);
    assert.match(policy.message, /공단 평가와 다른 의료기관 자료/);
});
/** SOFTM-COMPARE-ACTUAL-DATA END */
