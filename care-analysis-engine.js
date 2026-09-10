/** SOFTM-CARE-ANALYSIS START 날짜:20260911 : 거주지 주변 전체 후보를 같은 근거로 집계하고 자료 미확인을 조건 불충족으로 오인하지 않도록 분리 */
const earthRadius = 6371;
const radians = value => value * Math.PI / 180;
const degrees = value => value * 180 / Math.PI;
const radii = new Set([1, 3, 5, 10]);
const validPoint = point => Boolean(point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180);

function validate(origin, radiusKm) {
    if (!validPoint(origin)) throw new TypeError('기준 위치의 위도와 경도를 확인해 주세요.');
    if (!radii.has(radiusKm)) throw new RangeError('분석 반경은 1·3·5·10km 중에서 선택해 주세요.');
}

export function distanceKm(origin, destination) {
    if (!validPoint(origin) || !validPoint(destination)) return null;
    const latitude = radians(destination.lat - origin.lat), longitude = radians(destination.lng - origin.lng);
    const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(origin.lat)) * Math.cos(radians(destination.lat)) * Math.sin(longitude / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(Math.max(0, Math.min(1, value))));
}

export function radiusBounds(origin, radiusKm) {
    validate(origin, radiusKm);
    const angle = radiusKm / earthRadius, latitude = radians(origin.lat);
    const south = Math.max(-90, origin.lat - degrees(angle)), north = Math.min(90, origin.lat + degrees(angle));
    const delta = south === -90 || north === 90 ? 180 : degrees(Math.asin(Math.min(1, Math.sin(angle) / Math.cos(latitude))));
    const crossesDateLine = origin.lng - delta < -180 || origin.lng + delta > 180;
    const west = crossesDateLine ? -180 : Math.max(-180, origin.lng - delta);
    const east = crossesDateLine ? 180 : Math.min(180, origin.lng + delta);
    return { getSW: () => ({ lat: () => south, lng: () => west }), getNE: () => ({ lat: () => north, lng: () => east }) };
}

function readSafely(callback, ...args) {
    try { return typeof callback === 'function' ? callback(...args) : null; } catch { return null; }
}

function assess(row, criterion, options) {
    const result = { id: criterion.id, label: criterion.label, status: 'unknown', evidence: '', question: '' };
    if (criterion.id === 'evaluation-ab') {
        const grade = row.g || row.ev?.grade, year = row.ey || row.ev?.year;
        result.status = /^[A-E]$/.test(grade || '') ? (grade === 'A' || grade === 'B' ? 'confirmed' : 'different') : 'unknown';
        result.evidence = result.status === 'unknown' ? '공단 평가등급 미확인입니다. 낮은 평가를 뜻하지 않습니다.' : `공단 평가 ${grade}등급 · ${year ? `${year}년` : '평가연도 미확인'}. 평가연도가 다르면 점수를 직접 비교하기 어렵습니다.`;
        result.question = '최근 공단 평가 결과와 평가연도를 확인할 수 있나요?';
    } else if (criterion.kind === 'feature') {
        result.status = (criterion.keys || []).some(key => readSafely(options.hasFeature, row, key) === true) ? 'confirmed' : 'unknown';
        result.evidence = result.status === 'confirmed' ? '공단 공개 특화서비스 목록에서 확인됩니다.' : '공단 수집 목록에서 확인되지 않습니다. 제공하지 않는다는 뜻은 아닙니다.';
        result.question = `${criterion.label}을 현재 이용할 수 있나요? 대상과 이용 절차는 어떻게 되나요?`;
    } else if (criterion.kind === 'photos') {
        const count = readSafely(options.photoFor, row);
        result.status = Number.isFinite(count) && count > 0 ? 'confirmed' : count === 0 ? 'different' : 'unknown';
        result.evidence = result.status === 'confirmed' ? `수집된 공개 사진 ${count}장이 있습니다. 현재 시설 상태를 보장하지 않습니다.` : result.status === 'different' ? '수집된 사진 목록에 등록 사진이 없습니다.' : '공개 사진 자료를 확인하지 못했습니다.';
        result.question = '현재 시설 공간과 생활환경을 사진 또는 방문으로 확인할 수 있나요?';
    }
    return result;
}

export function analyzeInstitutions(rows, options = {}) {
    const { type = 'daycare', origin, radiusKm, sourceDate = '', featureDate = '' } = options;
    validate(origin, radiusKm);
    const selected = [...new Map((rows || []).filter(row => row && row.i !== null && row.i !== undefined && String(row.i) !== '').map(row => [String(row.i), row])).values()];
    const criteria = [...new Map((options.criteria || []).filter(criterion => type !== 'nursing-hospital' && criterion && criterion.kind !== 'staff' && (criterion.id === 'evaluation-ab' || ['feature', 'photos'].includes(criterion.kind))).map(criterion => [criterion.id, criterion])).values()];
    const nearby = [], unknownLocation = [];
    for (const row of selected) {
        const distance = distanceKm(origin, readSafely(options.coordFor, row));
        if (distance === null) { unknownLocation.push(row); continue; }
        if (distance > radiusKm + 1e-9) continue;
        const conditions = criteria.map(criterion => assess(row, criterion, options));
        nearby.push({ row, distance, conditions, confirmed: conditions.filter(condition => condition.status === 'confirmed').length, unknown: conditions.filter(condition => condition.status === 'unknown').length });
    }
    nearby.sort((a, b) => a.distance - b.distance || String(a.row.i).localeCompare(String(b.row.i), 'en'));
    const counts = criteria.map(criterion => ({ id: criterion.id, label: criterion.label, confirmed: 0, unknown: 0, different: 0 }));
    for (const entry of nearby) entry.conditions.forEach((condition, index) => counts[index][condition.status]++);
    return { total: selected.length, nearby, unknownLocation, allConfirmed: criteria.length ? nearby.filter(entry => entry.confirmed === criteria.length) : [], counts, sourceDate, featureDate };
}
/** SOFTM-CARE-ANALYSIS END */
