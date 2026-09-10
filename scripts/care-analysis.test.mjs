/** SOFTM-CARE-ANALYSIS-TEST START 날짜:20260911 : 거리 경계·결측·조건별 분모와 원본 보존을 검사해 주변 후보를 잘못 제외하거나 추천하는 일을 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInstitutions, distanceKm, radiusBounds } from '../care-analysis-engine.js';
import { resolveCoordinates } from '../care-analysis-data.js';
const origin = { lat: 37.5, lng: 127 };
const north = km => ({ lat: origin.lat + km / 6371 * 180 / Math.PI, lng: origin.lng });
const evaluation = { id: 'evaluation-ab', label: '공단 평가 A·B', kind: 'evaluation' };
const feature = { id: 'dementia', label: '치매전담', kind: 'feature', keys: ['one', 'two'] };
const photos = { id: 'photos', label: '사진', kind: 'photos' };
const options = { origin, radiusKm: 3, coordFor: row => row.coord };

test('기준 위치·반경을 검증하고 잘못된 좌표를 거리 0으로 바꾸지 않는다', () => {
    assert.throws(() => analyzeInstitutions([], { ...options, origin: { lat: '37', lng: 127 } }), TypeError);
    assert.throws(() => radiusBounds(origin, 2), RangeError);
    assert.throws(() => analyzeInstitutions([], { ...options, origin: { lat: 91, lng: 127 } }), TypeError);
    assert.equal(distanceKm(origin, { lat: NaN, lng: 127 }), null);
    assert.equal(distanceKm(origin, origin), 0);
    assert.ok(Math.abs(distanceKm(origin, north(3)) - 3) < 1e-8);
});

test('반경 경계를 포함하고 바깥·좌표 미확인을 분리한다', () => {
    const rows = [{ i: 'edge', coord: north(3) }, { i: 'out', coord: north(3.001) }, { i: 'missing' }, { i: 'bad', coord: { lat: 999, lng: 0 } }];
    const report = analyzeInstitutions(rows, options);
    assert.equal(report.total, 4);
    assert.deepEqual(report.nearby.map(entry => entry.row.i), ['edge']);
    assert.deepEqual(report.unknownLocation.map(row => row.i), ['missing', 'bad']);
    assert.deepEqual(report.allConfirmed, []);
    const bounds = radiusBounds(origin, 3), point = north(3);
    assert.ok(point.lat <= bounds.getNE().lat() && point.lng >= bounds.getSW().lng());
    assert.ok(bounds.getSW().lat() < origin.lat && bounds.getNE().lng() > origin.lng);
    const polar = radiusBounds({ lat: 90, lng: 180 }, 10);
    assert.equal(polar.getNE().lat(), 90);
    assert.equal(polar.getSW().lng(), -180);
});

test('기관기호 중복 제거·거리 정렬·원본 불변과 표시 제한 없는 집계를 유지한다', () => {
    const rows = Array.from({ length: 1201 }, (_, index) => ({ i: String(index), coord: north(1), g: 'A', ey: 2025 }));
    rows.push(rows[0]);
    const before = JSON.stringify(rows);
    const report = analyzeInstitutions(rows, { ...options, criteria: [evaluation] });
    assert.equal(report.total, 1201);
    assert.equal(report.nearby.length, 1201);
    assert.equal(report.allConfirmed.length, 1201);
    assert.equal(report.counts[0].confirmed, 1201);
    assert.equal(JSON.stringify(rows), before);
    assert.deepEqual(analyzeInstitutions([{ i: 'b', coord: north(1) }, { i: 'a', coord: north(1) }, { i: 'z', coord: origin }], options).nearby.map(entry => entry.row.i), ['z', 'a', 'b']);
});

test('평가연도와 미확인을 보존하고 복수 조건을 모두 확인한 후보만 분리한다', () => {
    const rows = [{ i: 'a', coord: origin, g: 'A', ey: 2023 }, { i: 'b', coord: north(1), g: 'C', ey: 2024 }, { i: 'c', coord: north(2) }];
    const report = analyzeInstitutions(rows, { ...options, criteria: [evaluation, feature, photos], hasFeature: (row, key) => row.i === 'a' && key === 'two', photoFor: row => row.i === 'a' ? 2 : row.i === 'b' ? 0 : null, sourceDate: '2026-09-09', featureDate: '2026-09-08' });
    assert.deepEqual(report.allConfirmed.map(entry => entry.row.i), ['a']);
    assert.match(report.nearby[0].conditions[0].evidence, /2023년/);
    assert.match(report.nearby[1].conditions[0].evidence, /2024년/);
    assert.equal(report.nearby[2].unknown, 3);
    assert.equal(report.counts[1].different, 0);
    assert.equal(report.counts[2].different, 1);
    for (const count of report.counts) assert.equal(count.confirmed + count.unknown + count.different, report.nearby.length);
    assert.equal(report.sourceDate, '2026-09-09');
    assert.equal(report.featureDate, '2026-09-08');
});

test('병원 평가·인력 조건은 제외하고 조회 실패는 미확인으로 남긴다', () => {
    const rows = [{ i: 'a', coord: origin, g: 'A', rn: 1 }];
    const hospital = analyzeInstitutions(rows, { ...options, type: 'nursing-hospital', criteria: [evaluation, feature, photos, { id: 'nurse', kind: 'staff' }] });
    assert.deepEqual(hospital.counts, []);
    assert.deepEqual(hospital.allConfirmed, []);
    const failed = analyzeInstitutions(rows, { ...options, criteria: [photos, feature], photoFor: () => { throw Error('offline'); }, hasFeature: () => { throw Error('offline'); } });
    assert.equal(failed.nearby[0].unknown, 2);
    assert.deepEqual(failed.allConfirmed, []);
});

test('전체 1,201개 좌표를 최대 4개 동시 요청으로 처리하고 캐시·실패도 진행에 집계한다', async () => {
    const rows = Array.from({ length: 1201 }, (_, index) => ({ i: String(index) }));
    let active = 0, maximum = 0, saved = 0;
    const progress = [];
    const result = await resolveCoordinates([...rows, rows[0]], {
        cachedCoord: row => row.i === '0' ? origin : null,
        geocode: async row => {
            active++; maximum = Math.max(maximum, active);
            await new Promise(resolve => setImmediate(resolve));
            active--;
            if (row.i === '1') throw Error('offline');
            if (row.i === '2') return { lat: 91, lng: 127 };
            return origin;
        },
        saveCoord: () => saved++,
        onProgress: value => progress.push(value),
    });
    assert.equal(result.size, 1201);
    assert.equal(maximum, 4);
    assert.equal(saved, 1198);
    assert.equal(result.get('1'), null);
    assert.equal(result.get('2'), null);
    assert.deepEqual(progress.at(-1), { done: 1201, total: 1201, failed: 2 });
    assert.equal(progress.length, 1201);
});

test('취소된 요청은 남은 조회를 시작하지 않고 늦은 응답의 저장·진행을 차단한다', async () => {
    let current = true, starts = 0, saves = 0, progresses = 0;
    const releases = [];
    const promise = resolveCoordinates(Array.from({ length: 12 }, (_, i) => ({ i })), {
        geocode: () => { starts++; return new Promise(resolve => releases.push(resolve)); },
        saveCoord: () => saves++, onProgress: () => progresses++, isCurrent: () => current,
    });
    assert.equal(starts, 4);
    current = false;
    releases.forEach(resolve => resolve(origin));
    await assert.rejects(promise, error => error.name === 'AbortError');
    assert.equal(starts, 4);
    assert.equal(saves, 0);
    assert.equal(progresses, 0);
    await assert.rejects(resolveCoordinates([{ i: 'never' }], { isCurrent: () => false, geocode: () => { throw Error('should not run'); } }), error => error.name === 'AbortError');
});
/** SOFTM-CARE-ANALYSIS-TEST END */
