/** SOFTM-PHOTO-GALLERY START 날짜:20260911 : 많은 기관의 사진을 한꺼번에 요청하지 않고 순서대로 나누어 탐색 */
export function createGallery(rows, fetchPhotos, { batchSize = 6, concurrency = 3, pageSize = 60 } = {}) {
    let cursor = 0, active = true, pending = null;
    const queue = [], items = [], failures = new Map(), empty = new Set();
    async function collect(batch) {
        let next = 0;
        const results = new Array(batch.length);
        await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
            while (active && next < batch.length) {
                const index = next++, row = batch[index];
                try {
                    const data = await fetchPhotos(row.i);
                    if (!Array.isArray(data?.photos)) throw new Error('사진 자료 형식 오류');
                    results[index] = data.photos.map((photo, ordinal) => ({ row, photo, key: `${row.i}:${ordinal}` }));
                    if (active) { failures.delete(row.i); if (!data.photos.length) empty.add(row.i); }
                } catch {
                    if (active) failures.set(row.i, row);
                }
            }
        }));
        if (active) queue.push(...results.flatMap(value => value || []));
    }
    const snapshot = () => ({ items: [...items], failures: [...failures.values()], empty: empty.size, visited: cursor, more: queue.length > 0 || cursor < rows.length });
    function next({ retry = false } = {}) {
        if (!active) return Promise.resolve(snapshot());
        if (pending) return pending;
        pending = (async () => {
            if (retry) await collect([...failures.values()].slice(0, batchSize));
            else if (queue.length < pageSize && cursor < rows.length) {
                const batch = rows.slice(cursor, cursor + batchSize);
                cursor += batch.length;
                await collect(batch);
            }
            if (active) items.push(...queue.splice(0, pageSize));
            return snapshot();
        })().finally(() => { pending = null; });
        return pending;
    }
    return { next, snapshot, cancel: () => { active = false; } };
}
/** SOFTM-PHOTO-GALLERY END */
