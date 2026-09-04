/** SOFTM-ADVANCED-SEARCH START 날짜:20260904 : 미확인 값을 확정값으로 처리하거나 조건 조합·공유 복원에서 기관이 누락되는 것을 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import '../advanced-search.js';

const api = globalThis.CareAdvancedSearch;
const index = JSON.parse(gunzipSync(readFileSync(new URL('../data/nhis/search-index.json.gz', import.meta.url))));
const rows = type => JSON.parse(gunzipSync(readFileSync(new URL(`../data/care/${type}.json.gz`, import.meta.url))));

test('공단 원문에서 모은 모든 상세조건이 실제 기관에 연결됨', () => {
    assert.equal(index.features.length, 13);
    assert.ok(Object.keys(index.records).length > 25000);
    for (const type of ['facility', 'daycare', 'home-care', 'home-nursing', 'short-stay', 'dementia']) {
        const records = rows(type);
        const model = api.createMatcher(index, type);
        for (const group of api.groupsFor(type)) {
            for (const [feature] of group.options) {
                const mask = 1 << index.features.indexOf(feature);
                const expected = records.filter(row => ((index.records[row.i]?.[1] || 0) & mask) !== 0).map(row => row.i);
                const state = { ...api.emptyState(), features: [feature] };
                assert.deepEqual(records.filter(row => model.matches(row, state)).map(row => row.i), expected, `${type}/${feature}`);
            }
        }
    }
});

test('같은 제공서비스 묶음은 OR, 설립주체와 별도 묶음은 AND', () => {
    const fixture = { features: ['dementia-facility', 'dementia-home', 'green', 'panel'], records: {
        a: [3, 1 | 4], b: [4, 2 | 4 | 8], c: [3, 2], d: [3, 4]
    } };
    const model = api.createMatcher(fixture, 'facility');
    const all = ['a', 'b', 'c', 'd'].map(i => ({ i, t: i === 'a' ? 'A03,G31' : 'A04' }));
    let state = { ...api.emptyState(), features: ['dementia-facility', 'dementia-home'] };
    assert.deepEqual(all.filter(row => model.matches(row, state)).map(row => row.i), ['a', 'b', 'c']);
    state.features.push('green');
    assert.deepEqual(all.filter(row => model.matches(row, state)).map(row => row.i), ['a', 'b']);
    state.owner = '3';
    assert.deepEqual(all.filter(row => model.matches(row, state)).map(row => row.i), ['a']);
    state.features.push('panel');
    assert.equal(all.filter(row => model.matches(row, state)).length, 0);
});

test('미확인 설립주체와 치매전담 공동생활가정이 정확히 구분됨', () => {
    const model = api.createMatcher({ features: [], records: { a: [4, 0] } }, 'facility');
    const unknown = { i: 'unknown', t: 'S41' };
    assert.equal(model.matches(unknown, { ...api.emptyState(), owner: '0' }), true);
    assert.equal(model.matches(unknown, { ...api.emptyState(), owner: '4' }), false);
    assert.equal(model.matches(unknown, { ...api.emptyState(), facility: 'home' }), true);
    assert.equal(model.matches(unknown, { ...api.emptyState(), facility: 'facility' }), false);
});

test('도로명·읍면동은 기관명 대신 주소 필드에서 검색', () => {
    const model = api.createMatcher(index, 'daycare');
    const row = { i: 'x', n: '서초동복지센터', a: '서울특별시 강남구 헌릉로590길 50 (세곡동) 101동' };
    assert.equal(model.matches(row, { ...api.emptyState(), address: '서초동' }), false);
    assert.equal(model.matches(row, { ...api.emptyState(), address: '세곡동' }), true);
    assert.equal(model.matches(row, { ...api.emptyState(), addressMode: 'road', address: '헌릉로590길' }), true);
    assert.equal(api.addressParts(row, 'dong').includes('101동'), false);
});

test('공유 링크 왕복·유형 전환·초기화 때 유효한 조건만 남음', () => {
    const state = { owner: '2', facility: '', address: '세곡동', addressMode: 'dong', features: ['cognitive-daycare', 'short-pilot'] };
    const params = new URLSearchParams('q=센터&p=서울특별시');
    api.writeState(params, state);
    assert.deepEqual(api.readState(params, 'daycare'), state);
    assert.equal(params.get('q'), '센터');
    assert.deepEqual(api.readState(params, 'nursing-hospital').features, []);
    assert.equal(api.readState(params, 'nursing-hospital').owner, '');
    api.writeState(params, api.emptyState());
    assert.equal(params.has('features'), false);
    assert.equal(params.has('address'), false);
    assert.equal(params.has('owner'), false);
});

test('두 지도 목록·지도 후보·공유 링크가 공통 상세조건을 사용', () => {
    for (const name of ['nationwide-care-services-map.html', 'nationwide-daycare-map.html']) {
        const html = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
        assert.ok(html.includes('advancedSearch.matches(c)'));
        assert.ok(html.includes('advancedSearch?.write('));
        assert.ok(html.includes('CareAdvancedSearch.mount('));
        assert.ok(html.includes('advanced-search.css'));
    }
});
/** SOFTM-ADVANCED-SEARCH END */
