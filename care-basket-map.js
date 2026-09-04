/** SOFTM-BASKET-MAP START 날짜:20260905 : 검색 상태와 방문 순서를 보존하며 경로 전체 표시·진행·실패 결과를 확실히 안내 */
(function (root) {
    'use strict';
    function create(adapter) {
        let snapshot = null, generation = 0, controller = null, ids = [], timer = null;
        const active = () => snapshot !== null;
        function cancel() { generation++; clearTimeout(timer); controller?.abort(); controller = null; adapter.busy?.(false); }
        function exit() {
            if (!active()) return;
            cancel();
            const saved = snapshot;
            snapshot = null; ids = [];
            adapter.clear(); adapter.restore(saved); adapter.mode(false);
        }
        async function show(rows, { route = false, fit = true } = {}) {
            if (!adapter.ready()) { adapter.status('지도를 연결하는 중입니다. 잠시 후 다시 눌러 주세요.'); return; }
            if (route && (rows.length < 1 || rows.length > 16)) { adapter.status('방문 경로는 비교함에 1~16곳을 담아 이용해 주세요.'); return; }
            if (!active()) snapshot = adapter.capture();
            cancel();
            const token = generation, current = () => token === generation && active();
            ids = rows.map(row => String(row.i));
            adapter.mode(true); adapter.clear(); adapter.select(rows); adapter.busy?.(route);
            adapter.status(rows.length ? `비교함 ${rows.length}곳의 위치를 확인하고 있습니다.` : '비교함이 비었습니다. 검색 결과 지도로 돌아갈 수 있습니다.');
            let timedOut = false;
            try {
                const placed = [], missing = [];
                for (let index = 0; index < rows.length; index += 6) {
                    const batch = rows.slice(index, index + 6), coords = await Promise.allSettled(batch.map(row => Promise.resolve().then(() => adapter.geocode(row))));
                    if (!current()) return;
                    batch.forEach((row, offset) => {
                        const value = coords[offset].status === 'fulfilled' ? coords[offset].value : null;
                        if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) placed.push({ row, point: value, rank: index + offset + 1 });
                        else missing.push(row.n);
                    });
                }
                if (!current()) return;
                placed.forEach(item => adapter.place(item));
                if (fit && placed.length) adapter.fit(placed.map(item => item.point));
                const note = `비교함 ${rows.length}곳 · 지도 ${placed.length}곳${missing.length ? ` · 위치 확인 필요: ${missing.join(', ')}` : ''}`;
                adapter.status(`${note}. ${route && missing.length ? '모든 기관의 위치를 확인해야 경로를 계산할 수 있습니다.' : '지도 번호는 비교함 순서입니다. 검색 조건은 유지됩니다.'}`);
                if (!route || missing.length || !placed.length) return;
                const requestController = new AbortController();
                controller = requestController;
                timer = setTimeout(() => { timedOut = true; requestController.abort(); }, 20000);
                const start = snapshot.start, points = placed.map(item => item.point);
                adapter.status(`비교함 순서대로 ${rows.length}곳의 도로 경로를 탐색하고 있습니다.`);
                const response = await adapter.fetch({ start, goal: points.at(-1), waypoints: points.slice(0, -1), option: 'traoptimal' }, requestController.signal);
                if (!current()) return;
                const data = await response.json();
                if (!current()) return;
                if (!response.ok || data.error) {
                    adapter.status(`경로를 찾지 못했습니다. ${typeof data.error === 'string' ? data.error : '잠시 후 경로탐색을 다시 눌러 주세요.'}`);
                    return;
                }
                const distance = Number(data.summary?.distance ?? data.distance), duration = Number(data.summary?.duration ?? data.duration);
                if (!Array.isArray(data.path) || data.path.length < 2 || data.path.some(p => !Array.isArray(p) || p.length < 2 || !p.every(Number.isFinite)) || !Number.isFinite(distance) || !Number.isFinite(duration)) throw new Error('도로 경로 응답을 확인할 수 없습니다.');
                adapter.draw(data.path);
                adapter.fit([start, ...points, ...data.path.map(([lng, lat]) => ({ lat, lng }))]);
                adapter.status(`경로탐색 완료 · ${rows.length}곳 · ${(distance / 1000).toFixed(1)}km · 약 ${Math.round(duration / 60000)}분 · 출발: 기준 위치 → ${rows.map(row => row.n).join(' → ')}`);
            } catch (error) {
                if (current() && (error.name !== 'AbortError' || timedOut)) adapter.status(timedOut ? '경로 응답이 지연되고 있습니다. 경로탐색을 다시 눌러 주세요.' : '도로 경로를 불러오지 못했습니다. 담은 기관과 순서는 유지됩니다. 경로탐색을 다시 눌러 주세요.');
            } finally {
                if (current()) { clearTimeout(timer); controller = null; adapter.busy?.(false); }
            }
        }
        return Object.freeze({ active, has: id => ids.includes(String(id)), show, exit });
    }
    root.CareBasketMap = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-BASKET-MAP END */
