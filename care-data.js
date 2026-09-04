/** SOFTM-DATA-UNIFIED START 날짜:20260904 : 두 지도가 같은 수집 자료의 압축 검색 인덱스를 읽고 파일 누락을 빈 목록으로 오인하지 않도록 통일 */
(function () {
    'use strict';
    const base = new URL('data/care/', document.baseURI);
    const tasks = new Map();

    function load(file) {
        if (tasks.has(file)) return tasks.get(file);
        const task = fetch(new URL(file, base), { cache: 'no-cache' }).then(async response => {
            if (!response.ok) throw new Error(`기관 자료를 불러오지 못했습니다. (${response.status})`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            const compressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
            if (compressed && typeof DecompressionStream !== 'function') throw new Error('기관 자료 압축 해제를 위해 브라우저를 최신 버전으로 업데이트해 주세요.');
            const text = compressed
                ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
                : new TextDecoder().decode(bytes);
            return JSON.parse(text);
        }).catch(error => { tasks.delete(file); throw error; });
        tasks.set(file, task);
        return task;
    }

    async function manifest() {
        const result = await load('manifest.json');
        if (!result.daycare?.file) throw new Error('기관 자료 목록이 올바르지 않습니다.');
        return result;
    }

    async function category(type) {
        const config = (await manifest())[type];
        if (!config) throw new Error('지원하지 않는 기관 유형입니다.');
        const rows = await load(`${config.file}?v=${encodeURIComponent(config.revision)}`);
        if (!Array.isArray(rows) || rows.length !== config.count || new Set(rows.map(row => row.i)).size !== rows.length) {
            throw new Error('기관 자료가 갱신 중입니다. 잠시 후 새로고침해 주세요.');
        }
        return rows;
    }

    window.CareData = Object.freeze({ manifest, category });
})();
/** SOFTM-DATA-UNIFIED END */
