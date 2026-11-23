/** SOFTM-CARE-GAP-TEST START 날짜:20261123 : 수요·공급 지표, 공개자료 결합, 행정구역 검색 연결을 회귀검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    HEAT_COLORS, buildHeatScale, institutionSearchUrl, recognitionRange, sortByPressure
} from '../care-gap-engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const collection = JSON.parse(fs.readFileSync(path.join(root, 'data/care-gap/regions.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/care/manifest.json'), 'utf8'));

test('공급 압력은 기관 0곳을 가장 높은 단계로 표시한다', () => {
    const features = [
        { properties: { id: 'a', label: '가 지역', recognized: 100, counts: { daycare: 10 } } },
        { properties: { id: 'b', label: '나 지역', recognized: 30, counts: { daycare: 0 } } },
        { properties: { id: 'c', label: '다 지역', recognized: 20, counts: { daycare: 10 } } }
    ];
    const heat = buildHeatScale(features, 'daycare', 'supply');
    assert.equal(heat.get('b').percentile, 1);
    assert.equal(heat.get('b').color, HEAT_COLORS.at(-1));
    assert.equal(sortByPressure(features, heat)[0].properties.id, 'b');
});

test('공단 비식별 인정자 범위를 숫자 하나로 단정하지 않는다', () => {
    assert.equal(recognitionRange({ recognized: 13, recognizedMin: 11, recognizedMax: 15 }), '약 13명 (11~15명)');
    assert.equal(recognitionRange({ recognized: 13, recognizedMin: 13, recognizedMax: 13 }), '13명');
});

test('현재 행정구역과 이전 인천 기관 주소를 안전한 검색 범위로 연결한다', () => {
    const geomdan = institutionSearchUrl({ province: '인천광역시', region: '검단구', mapProvince: '인천광역시', mapLegacyCity: '서구' }, 'daycare');
    const jemulpo = institutionSearchUrl({ province: '인천광역시', region: '제물포구', mapProvince: '인천광역시', mapLegacyCity: '' }, 'daycare');
    assert.match(geomdan, /type=daycare/);
    assert.match(geomdan, /c=%EC%84%9C%EA%B5%AC/);
    assert.doesNotMatch(geomdan, /[?&]q=/);
    assert.match(jemulpo, /p=%EC%9D%B8%EC%B2%9C%EA%B4%91%EC%97%AD%EC%8B%9C/);
    assert.doesNotMatch(jemulpo, /[?&](?:c|q)=/);
});

test('배포 데이터는 230개 지역의 인구·경계·기관 집계를 모두 갖는다', () => {
    assert.equal(collection.type, 'FeatureCollection');
    assert.equal(collection.features.length, 230);
    assert.equal(collection.meta.populationDate, '2026-10-31');
    assert.equal(collection.meta.recognitionDate, '2026-08-31');
    assert.equal(collection.meta.institutionDate, '2026-09-30');
    assert.deepEqual(collection.meta.diagnostics, { institutionUnmatched: 0, boundaryUnmatched: 0 });
    assert.equal(new Set(collection.features.map(feature => feature.properties.id)).size, 230);
    for (const feature of collection.features) {
        assert.ok(feature.properties.population > 0, `${feature.properties.id} 주민등록인구`);
        assert.ok(feature.properties.elderly > 0, `${feature.properties.id} 고령인구`);
        assert.ok(feature.properties.recognized > 0, `${feature.properties.id} 인정자`);
        assert.ok(feature.geometry.coordinates.length > 0, `${feature.properties.id} 경계`);
    }
});

test('지역별 유형 기관 수의 합은 현재 공단 수집 매니페스트와 일치한다', () => {
    for (const type of Object.keys(collection.meta.types).filter(type => type !== 'all')) {
        const total = collection.features.reduce((sum, feature) => sum + feature.properties.counts[type], 0);
        assert.equal(total, manifest[type].count, `${type} 기관 수`);
    }
});

test('공개 화면은 산식·한계·기존 기관 탐색 진입을 함께 제공한다', () => {
    const html = fs.readFileSync(path.join(root, 'care-gap-map.html'), 'utf8');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const required of ['돌봄 공급 압력', '65세 이상 비율', '장기요양 인정 비율', '확정 부족 판정은 아닙니다', 'id="gapSources"']) assert.ok(html.includes(required), required);
    assert.ok(index.includes('href="care-gap-map.html"'));
});
/** SOFTM-CARE-GAP-TEST END */
