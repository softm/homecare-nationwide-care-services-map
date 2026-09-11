/** SOFTM-WORKSPACE-ROUTE START 날짜:20260905 : 검색 상태와 방문 계획을 분리하고 명시한 출발지만 경로에 사용 */
(function (root) {
    'use strict';
    const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 32 && p.lat <= 40 && p.lng >= 123 && p.lng <= 133;
    /** SOFTM-ROUTE-ERROR START 날짜:20260905 : 브라우저가 받은 통신 오류를 사용자가 조치 가능한 연결 상태로 구분 */
    function routeErrorMessage(error) {
        if (error?.name === 'TypeError') return '길찾기 서버에 연결할 수 없습니다. 서버 연결 상태를 확인한 뒤 다시 탐색해 주세요.';
        if (error?.name === 'SyntaxError') return '길찾기 서버 응답을 확인할 수 없습니다. 잠시 후 다시 탐색해 주세요.';
        return '도로 경로를 불러오지 못했습니다. 다시 탐색해 주세요.';
    }
    /** SOFTM-ROUTE-ERROR END */
    /** SOFTM-ROUTE-ORDER START 날짜:20260911 : 되돌아오는 도로에서도 요청한 방문 순번과 실제 경로 도착 지점을 직접 연결 */
    function orderedStops(rows, points, path, summary = {}) {
        const waypointMeta = Array.isArray(summary.waypoints) ? summary.waypoints : [];
        const routeMeta = [...waypointMeta, summary.goal];
        const indices = routeMeta.length === rows.length ? routeMeta.map(item => Number(item?.pointIndex)) : [];
        const locations = routeMeta.map(item => item?.location);
        const metadataMatches = indices.length === rows.length && indices.every((index, position) => {
            const location = locations[position], point = points[position];
            const closeToRequested = Array.isArray(location) && location.length >= 2 && validPoint({ lng: Number(location[0]), lat: Number(location[1]) })
                && Math.hypot(Number(location[0]) - point.lng, Number(location[1]) - point.lat) < .01;
            return Number.isInteger(index) && index >= 0 && index < path.length && closeToRequested && (!position || index >= indices[position - 1]);
        });
        return rows.map((row, index) => ({ id: String(row.i), name: row.n, point: points[index], ...(metadataMatches ? { pathIndex: indices[index] } : {}) }));
    }
    /** SOFTM-ROUTE-ORDER END */
    /** SOFTM-ROUTE-OPTIMIZE START 날짜:20260911 : 선택한 경우에만 출발지부터 모든 기관을 방문하는 좌표거리 최단 배열을 계산 */
    function distance(a, b) {
        const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
        const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
        return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
    }
    function optimizeVisitOrder(origin, items) {
        const count = items.length;
        if (count < 2 || !validPoint(origin)) return [...items];
        const states = 1 << count, width = count, all = states - 1;
        const costs = new Float64Array(states * width), parents = new Int8Array(states * width), between = new Float64Array(width * width);
        costs.fill(Infinity); parents.fill(-1);
        for (let from = 0; from < count; from++) {
            costs[(1 << from) * width + from] = distance(origin, items[from].point);
            for (let to = 0; to < count; to++) between[from * width + to] = distance(items[from].point, items[to].point);
        }
        for (let mask = 1; mask < states; mask++) {
            for (let last = 0; last < count; last++) {
                if (!(mask & (1 << last))) continue;
                const current = costs[mask * width + last];
                if (!Number.isFinite(current)) continue;
                let remaining = all ^ mask;
                while (remaining) {
                    const bit = remaining & -remaining, next = 31 - Math.clz32(bit), nextMask = mask | bit;
                    const candidate = current + between[last * width + next], offset = nextMask * width + next;
                    if (candidate < costs[offset] - .001) { costs[offset] = candidate; parents[offset] = last; }
                    remaining ^= bit;
                }
            }
        }
        let last = 0;
        for (let index = 1; index < count; index++) if (costs[all * width + index] < costs[all * width + last] - .001) last = index;
        const order = new Array(count); let mask = all;
        for (let position = count - 1; position >= 0; position--) {
            order[position] = items[last];
            const previous = parents[mask * width + last]; mask ^= 1 << last; last = previous;
        }
        return order;
    }
    /** SOFTM-ROUTE-OPTIMIZE END */
    function create(adapter) {
        let snapshot = null, generation = 0, controller = null, timer = null, ids = [], fitted = [];
        let state = { phase: 'idle', count: 0, placed: 0, missing: [], result: null };
        const active = () => snapshot !== null;
        function publish(phase, details = {}) { state = { ...state, phase, error: '', ...details }; adapter.state?.(state); }
        function cancel() { generation++; clearTimeout(timer); controller?.abort(); controller = null; }
        function exit() {
            cancel();
            if (active()) { const saved = snapshot; snapshot = null; adapter.clear(); adapter.restore(saved); }
            ids = []; fitted = []; publish('idle', { count: 0, placed: 0, missing: [], result: null });
        }
        async function show(rows, { route = false, fit = true, origin = null, optimize = false } = {}) {
            cancel();
            state = { phase: 'idle', count: rows.length, placed: 0, missing: [], result: null, origin };
            if (!adapter.ready()) { publish('waiting', { error: '지도를 연결하는 중입니다. 잠시만 기다려 주세요.' }); return state; }
            if (!active()) snapshot = adapter.capture();
            const token = generation, current = () => token === generation && active();
            ids = rows.map(row => String(row.i)); fitted = [];
            adapter.clear(); adapter.select?.(rows); adapter.origin?.(validPoint(origin?.point) ? origin : null);
            publish('locating');
            let timedOut = false;
            try {
                const placed = [], missing = [];
                for (let index = 0; index < rows.length; index += 6) {
                    const batch = rows.slice(index, index + 6), coords = await Promise.allSettled(batch.map(row => Promise.resolve().then(() => adapter.geocode(row))));
                    if (!current()) return state;
                    batch.forEach((row, offset) => {
                        const point = coords[offset].status === 'fulfilled' ? coords[offset].value : null;
                        if (validPoint(point)) placed.push({ row, point, rank: index + offset + 1 });
                        else missing.push({ id: String(row.i), name: row.n });
                    });
                }
                if (!current()) return state;
                const visitItems = route && optimize && rows.length <= 16 && validPoint(origin?.point) && !missing.length ? optimizeVisitOrder(origin.point, placed) : placed;
                visitItems.forEach((item, index) => adapter.place({ ...item, rank: index + 1 }));
                const visitRows = visitItems.map(item => item.row), points = visitItems.map(item => item.point);
                fitted = [...(validPoint(origin?.point) ? [origin.point] : []), ...points];
                if (fit && fitted.length) adapter.fit(fitted);
                publish('ready', { placed: placed.length, missing });
                if (!route) return state;
                if (!rows.length || rows.length > 16) { publish('error', { error: '방문 경로는 1~16곳까지 탐색할 수 있습니다.', field: 'stops' }); return state; }
                if (!validPoint(origin?.point) || !String(origin?.label || '').trim()) { publish('error', { error: '현재 위치 또는 주소를 선택해 출발지를 정해 주세요.', field: 'origin' }); return state; }
                if (missing.length) { publish('error', { error: `위치를 확인할 수 없는 기관: ${missing.map(item => item.name).join(', ')}. 해당 기관의 주소를 확인해 주세요.`, field: 'stops' }); return state; }
                const requestController = new AbortController(); controller = requestController;
                timer = setTimeout(() => { timedOut = true; requestController.abort(); }, 20000);
                publish('routing');
                const response = await adapter.fetch({ start: origin.point, goal: points.at(-1), waypoints: points.slice(0, -1), option: 'traoptimal' }, requestController.signal);
                if (!current()) return state;
                const data = await response.json();
                if (!current()) return state;
                if (!response.ok || data.error) { publish('error', { error: typeof data.error === 'string' ? data.error : '도로 경로를 찾지 못했습니다. 다시 탐색해 주세요.' }); return state; }
                const distance = Number(data.summary?.distance ?? data.distance), duration = Number(data.summary?.duration ?? data.duration);
                if (!Array.isArray(data.path) || data.path.length < 2 || data.path.some(p => !Array.isArray(p) || !validPoint({ lng: p[0], lat: p[1] })) || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(duration) || duration < 0) throw new Error('invalid route');
                adapter.draw(data.path);
                fitted = [origin.point, ...points, ...data.path.map(([lng, lat]) => ({ lat, lng }))];
                adapter.fit(fitted);
                /** SOFTM-ROUTE-OPTIMIZE START 날짜:20260911 : 변경 전후 배열을 구조화해 목록 갱신과 사용자 알림이 같은 결과를 사용 */
                const before = rows.map(row => ({ id: String(row.i), name: row.n }));
                const after = visitRows.map(row => ({ id: String(row.i), name: row.n }));
                const optimization = { requested: Boolean(optimize), changed: Boolean(optimize) && before.some((item, index) => item.id !== after[index]?.id), before, after };
                ids = after.map(item => item.id);
                publish('success', { result: { distance, duration, path: data.path, origin, stops: orderedStops(visitRows, points, data.path, data.summary), optimization } });
                /** SOFTM-ROUTE-OPTIMIZE END */
            } catch (error) {
                if (current() && (error.name !== 'AbortError' || timedOut)) publish('error', { error: timedOut ? '경로 응답이 지연되고 있습니다. 다시 탐색해 주세요.' : routeErrorMessage(error) }); // SOFTM-ROUTE-ERROR 날짜:20260905 : 통신·응답 형식·처리 오류를 같은 문구로 숨기지 않음
            } finally { if (current()) { clearTimeout(timer); controller = null; } }
            return state;
        }
        return Object.freeze({ active, has: id => ids.includes(String(id)), show, exit, fit() { if (active() && fitted.length) adapter.fit(fitted); }, state: () => state });
    }
    root.CareBasketMap = Object.freeze({ create, orderedStops, optimizeVisitOrder }); // SOFTM-ROUTE-OPTIMIZE 날짜:20260911 : 방문 배열 최적화와 응답 순서 연결을 회귀검사에서 직접 확인
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-WORKSPACE-ROUTE END */
