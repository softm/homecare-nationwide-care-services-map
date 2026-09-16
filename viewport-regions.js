/** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 시군구 누락을 막으면서 확인 가능한 읍면동 경계로 좌표 변환 후보를 줄임 */
(function (global) {
    'use strict';

    const aliases = { '강원도': '강원특별자치도', '전라북도': '전북특별자치도', '제주도': '제주특별자치도' };
    const boundaryMargin = 0.005;
    const neighborhoodMargin = 0.001; // SOFTM-VIEWPORT-CANDIDATES 날짜:20260914 : 공식 관할 합산 경계는 약 100m 여유만 두어 좁은 화면의 불필요한 좌표 확인을 줄임

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

    /** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 공식 관할 관계로 합친 경계와 주소의 법정 읍면동을 안전하게 연결 */
    function normalizeNeighborhood(value) {
        return String(value || '').replace(/\s+/g, '');
    }

    function rowNeighborhood(row) {
        const region = String(row?.r || '').trim();
        if (region) return normalizeNeighborhood(region.split(/\s+/).at(-1));
        const address = String(row?.a || '');
        const groups = [...address.matchAll(/\(([^)]*)\)/g)].map(match => match[1].split(',')[0].trim());
        const plain = address.replace(/\([^)]*\)/g, ' '), sources = [...groups.reverse(), plain];
        for (const source of sources) {
            const matches = [...source.matchAll(/([가-힣0-9·.]+(?:읍|면|동)|[가-힣·.]*\d+가)(?=[,\s)]|$)/gu)];
            if (matches.length) return normalizeNeighborhood(matches.at(-1)[1]);
        }
        return '';
    }

    function neighborhoodBounds(row) {
        const index = global.NATIONAL_REGION_BOUNDS?.neighborhoods, neighborhood = rowNeighborhood(row);
        if (!index || !neighborhood) return null;
        return index[`${regionKey(row.p, row.c)}|${neighborhood}`] || null;
    }
    /** SOFTM-VIEWPORT-CANDIDATES END */

    function intersects(box, bounds, margin = boundaryMargin) {
        if (!box) return true;
        const sw = bounds.getSW(), ne = bounds.getNE();
        return box[0] - margin <= ne.lng() && box[2] + margin >= sw.lng()
            && box[1] - margin <= ne.lat() && box[3] + margin >= sw.lat();
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
            const neighborhood = known ? null : neighborhoodBounds(row);
            if (!(known ? contains(bounds, point) : decisions.get(key) && (!neighborhood || intersects(neighborhood, bounds, neighborhoodMargin)))) continue;
            candidates.push(row);
            regions.set(key, { province: row.p, city: row.c });
        }
        return { regions: [...regions.values()], candidates };
    }

    /** SOFTM-VIEWPORT-RESOLVE START 날짜:20260914 : 느린 주소 하나가 다음 묶음을 막지 않도록 완료 즉시 다음 후보를 처리 */
    async function resolve(rows, resolver, options = {}) {
        const total = rows.length, results = Array(total), current = options.current || (() => true);
        /** SOFTM-QUERY-YIELD START 날짜:20260916 : 캐시 좌표의 연속 microtask가 필터 입력과 화면 갱신을 독점하지 않도록 모든 작업자가 같은 양보 시간을 공유 */
        let cursor = 0, done = 0, sliceCount = 0, sliceStart = Date.now(), pause = null;
        const yieldToInput = () => {
            if (!pause) pause = new Promise(resolve => setTimeout(resolve, 0)).then(() => {
                sliceCount = 0; sliceStart = Date.now(); pause = null;
            });
            return pause;
        };
        /** SOFTM-QUERY-YIELD END */
        async function worker() {
            while (current()) {
                /** SOFTM-QUERY-YIELD START 날짜:20260916 : 빠른 캐시도 최대 24건 또는 8ms마다 입력 처리를 허용하고 재개 전 취소 여부를 다시 확인 */
                if (pause || sliceCount >= 24 || Date.now() - sliceStart >= 8) await yieldToInput();
                if (!current()) return;
                sliceCount += 1;
                /** SOFTM-QUERY-YIELD END */
                const index = cursor++;
                if (index >= total) return;
                let result;
                try { result = { status: 'fulfilled', value: await resolver(rows[index]) }; }
                catch (reason) { result = { status: 'rejected', reason }; }
                results[index] = result;
                done += 1;
                if (!current()) return;
                options.onResult?.(rows[index], result, index);
                options.onProgress?.(done, total);
            }
        }
        const concurrency = Math.max(1, Math.min(total, Number(options.concurrency) || 8));
        await Promise.all(Array.from({ length: concurrency }, worker));
        return { results, done, cancelled: !current() };
    }
    /** SOFTM-VIEWPORT-RESOLVE END */

    global.MapViewportSearch = { select, resolve, regionKey, regionBounds, rowNeighborhood };
})(window);
/** SOFTM-VIEWPORT-CANDIDATES END */
