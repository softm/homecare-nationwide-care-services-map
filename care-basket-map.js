/** SOFTM-WORKSPACE-ROUTE START 날짜:20260905 : 검색 상태와 방문 계획을 분리하고 명시한 출발지만 경로에 사용 */
(function (root) {
    'use strict';
    const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 32 && p.lat <= 40 && p.lng >= 123 && p.lng <= 133;
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
        async function show(rows, { route = false, fit = true, origin = null } = {}) {
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
                placed.forEach(item => adapter.place(item));
                const points = placed.map(item => item.point);
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
                publish('success', { result: { distance, duration, origin, stops: rows.map(row => ({ id: String(row.i), name: row.n })) } });
            } catch (error) {
                if (current() && (error.name !== 'AbortError' || timedOut)) publish('error', { error: timedOut ? '경로 응답이 지연되고 있습니다. 다시 탐색해 주세요.' : '도로 경로를 불러오지 못했습니다. 다시 탐색해 주세요.' });
            } finally { if (current()) { clearTimeout(timer); controller = null; } }
            return state;
        }
        return Object.freeze({ active, has: id => ids.includes(String(id)), show, exit, fit() { if (active() && fitted.length) adapter.fit(fitted); }, state: () => state });
    }
    root.CareBasketMap = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-WORKSPACE-ROUTE END */
