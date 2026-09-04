/** SOFTM-VIEWPORT-REGIONS START 날짜:20260904 : 9개 역주소 표본 대신 화면과 겹치는 모든 지역을 검색해 시군구 사이의 기관 누락을 방지 */
(function (global) {
    'use strict';

    const aliases = { '강원도': '강원특별자치도', '전라북도': '전북특별자치도', '제주도': '제주특별자치도' };
    const boundaryMargin = 0.005;

    function regionKey(province, city) {
        const p = aliases[province] || province;
        let c = String(city || '').replace(/\s+/g, '');
        if (p === '세종특별자치시') c = '세종시';
        if (p === '인천광역시' && c === '남구') c = '미추홀구';
        return `${p}|${c}`;
    }

    function regionBounds(province, city) {
        const index = global.NATIONAL_REGION_BOUNDS?.regions;
        if (!index) throw new Error('지도 지역 범위 자료를 불러오지 못했습니다.');
        const key = regionKey(province, city);
        return index[key] || index[key.split('|')[0] + '|'] || null;
    }

    function intersects(box, bounds) {
        if (!box) return true;
        const sw = bounds.getSW(), ne = bounds.getNE();
        return box[0] - boundaryMargin <= ne.lng() && box[2] + boundaryMargin >= sw.lng()
            && box[1] - boundaryMargin <= ne.lat() && box[3] + boundaryMargin >= sw.lat();
    }

    function contains(bounds, point) {
        const sw = bounds.getSW(), ne = bounds.getNE();
        return point.lng >= sw.lng() && point.lng <= ne.lng() && point.lat >= sw.lat() && point.lat <= ne.lat();
    }

    function select(rows, bounds, coordFor = () => null) {
        const decisions = new Map(), regions = new Map(), candidates = [];
        for (const row of rows) {
            const key = `${row.p}|${row.c}`;
            if (!decisions.has(key)) decisions.set(key, intersects(regionBounds(row.p, row.c), bounds));
            const point = coordFor(row);
            const known = point && Number.isFinite(point.lat) && Number.isFinite(point.lng);
            if (!(known ? contains(bounds, point) : decisions.get(key))) continue;
            candidates.push(row);
            regions.set(key, { province: row.p, city: row.c });
        }
        return { regions: [...regions.values()], candidates };
    }

    global.MapViewportSearch = { select, regionKey, regionBounds };
})(window);
/** SOFTM-VIEWPORT-REGIONS END */
