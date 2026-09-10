/** SOFTM-CARE-ANALYSIS-DATA START 날짜:20260911 : 전체 후보의 좌표를 제한된 동시 요청으로 확인하고 취소된 분석이 캐시나 진행 상태를 덮어쓰지 않도록 보호 */
const validPoint = point => Boolean(point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180);

export async function resolveCoordinates(rows, { cachedCoord, geocode, saveCoord, onProgress, isCurrent = () => true } = {}) {
    const unique = [...new Map((rows || []).filter(row => row && row.i !== null && row.i !== undefined && String(row.i) !== '').map(row => [String(row.i), row])).values()];
    const results = new Map();
    let cursor = 0, done = 0, failed = 0;
    const current = () => { if (!isCurrent()) throw new DOMException('분석 요청이 취소되었습니다.', 'AbortError'); };
    async function worker() {
        while (cursor < unique.length) {
            current();
            const row = unique[cursor++];
            let point = null, cached = false;
            try { point = cachedCoord?.(row); } catch { point = null; }
            cached = validPoint(point);
            if (!cached) {
                current();
                try { point = await geocode?.(row); } catch { point = null; }
            }
            current();
            if (!validPoint(point)) { point = null; failed++; }
            if (point && !cached) {
                current();
                try { saveCoord?.(row, point); } catch { /* 캐시 저장 실패여도 현재 분석의 좌표 결과는 유지합니다. */ }
            }
            current();
            results.set(String(row.i), point);
            done++;
            onProgress?.({ done, total: unique.length, failed });
        }
    }
    current();
    await Promise.all(Array.from({ length: Math.min(4, unique.length) }, () => worker()));
    current();
    return results;
}
/** SOFTM-CARE-ANALYSIS-DATA END */
