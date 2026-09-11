/** SOFTM-PHOTO-WALL START 날짜:20260911 : 원본 비율의 사진을 짧은 열부터 배치하고 추가 로딩에도 기존 DOM과 포커스를 보존 */
export function mountMasonry(host) {
    let frame = 0;
    const observed = new Set();
    const schedule = () => { if (!frame) frame = requestAnimationFrame(layout); };
    const resize = new ResizeObserver(schedule);
    function layout() {
        frame = 0;
        const tiles = [...host.children], active = ['gallery', 'dense'].includes(host.dataset.mode);
        if (!active) {
            host.style.removeProperty('height');
            for (const tile of tiles) for (const key of ['width', 'left', 'top']) tile.style.removeProperty(key);
            return;
        }
        const width = host.clientWidth;
        if (!width) return;
        const dense = host.dataset.mode === 'dense', gap = width < 600 ? 8 : dense ? 12 : 20;
        const columns = width < 600 ? (dense ? 3 : 2) : width < 1000 ? (dense ? 4 : 3) : (dense ? 6 : 4); // SOFTM-PHOTO-READABILITY 날짜:20260911 : 모바일에서도 두 모드의 사진 밀도를 분명하게 구분
        const tileWidth = (width - gap * (columns - 1)) / columns, heights = Array(columns).fill(0);
        for (const tile of tiles) {
            const column = heights.indexOf(Math.min(...heights));
            const values = { width: `${tileWidth}px`, left: `${column * (tileWidth + gap)}px`, top: `${heights[column]}px` };
            for (const [key, value] of Object.entries(values)) if (tile.style[key] !== value) tile.style[key] = value;
            heights[column] += tile.getBoundingClientRect().height + gap;
        }
        const height = `${Math.max(0, ...heights) - (tiles.length ? gap : 0)}px`;
        if (host.style.height !== height) host.style.height = height;
    }
    const mutations = new MutationObserver(() => {
        for (const tile of observed) if (!host.contains(tile)) { resize.unobserve(tile); observed.delete(tile); }
        for (const tile of host.children) if (!observed.has(tile)) { observed.add(tile); resize.observe(tile); }
        schedule();
    });
    mutations.observe(host, { childList: true, attributes: true, attributeFilter: ['data-mode'] });
    resize.observe(host); host.addEventListener('load', schedule, true); host.addEventListener('error', schedule, true);
    schedule();
}
/** SOFTM-PHOTO-WALL END */
