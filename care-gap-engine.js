/** SOFTM-CARE-GAP-ENGINE START 날짜:20261123 : 지역 수요·공급 비율을 과장 없는 상대 스펙트럼과 기관 탐색 링크로 변환 */
export const HEAT_COLORS = ['#176b66', '#5ba86e', '#f1c75b', '#ef8d45', '#c9413a'];
export const HEAT_LABELS = ['상대 공급 많음', '공급 양호', '중간', '관찰 필요', '부족 가능성 높음'];
export const METRICS = {
    supply: { label: '돌봄 공급 압력', help: '65세 이상 장기요양 인정자 수를 선택한 기관 수로 나눈 상대 지표' },
    elderly: { label: '65세 이상 인구 비율', help: '전체 주민등록인구 중 65세 이상 인구 비율' },
    recognition: { label: '장기요양 인정 비율', help: '65세 이상 인구 중 장기요양 인정자 추정 비율' }
};

function midpointRanks(rows) {
    const sorted = [...rows].sort((left, right) => left.value - right.value || left.id.localeCompare(right.id, 'ko'));
    const ranks = new Map();
    for (let start = 0; start < sorted.length;) {
        let end = start;
        while (end + 1 < sorted.length && sorted[end + 1].value === sorted[start].value) end += 1;
        const rank = sorted.length <= 1 ? 0.5 : ((start + end) / 2) / (sorted.length - 1);
        for (let index = start; index <= end; index += 1) ranks.set(sorted[index].id, rank);
        start = end + 1;
    }
    return ranks;
}

export function metricValue(properties, type = 'all', metric = 'supply') {
    if (metric === 'elderly') return Number(properties.elderlyRate) || 0;
    if (metric === 'recognition') return Number(properties.recognizedRate) || 0;
    const institutions = Number(properties.counts?.[type]) || 0;
    const recognized = Number(properties.recognized) || 0;
    return institutions > 0 ? recognized / institutions : recognized > 0 ? Number.POSITIVE_INFINITY : 0;
}

export function buildHeatScale(features, type = 'all', metric = 'supply') {
    const values = features.map(feature => ({ id: feature.properties.id, value: metricValue(feature.properties, type, metric) }));
    const finite = values.filter(row => Number.isFinite(row.value));
    const ranks = midpointRanks(finite);
    for (const row of values.filter(row => !Number.isFinite(row.value))) ranks.set(row.id, 1);
    return new Map(values.map(row => {
        const percentile = ranks.get(row.id) ?? 0;
        const band = Math.max(0, Math.min(4, Math.floor(percentile * 5)));
        return [row.id, { value: row.value, percentile, band, color: HEAT_COLORS[band], label: metric === 'supply' ? HEAT_LABELS[band] : `${METRICS[metric].label} 상위 ${Math.max(1, Math.round((1 - percentile) * 100))}%` }];
    }));
}

export function institutionsPerThousand(properties, type = 'all') {
    const count = Number(properties.counts?.[type]) || 0;
    const recognized = Number(properties.recognized) || 0;
    return recognized ? count / recognized * 1000 : 0;
}

export function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString('ko-KR');
}

export function formatDecimal(value, digits = 1) {
    return (Number(value) || 0).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function recognitionRange(properties) {
    const min = Number(properties.recognizedMin) || 0, max = Number(properties.recognizedMax) || 0;
    return min === max ? `${formatNumber(min)}명` : `약 ${formatNumber(properties.recognized)}명 (${formatNumber(min)}~${formatNumber(max)}명)`;
}

export function institutionSearchUrl(properties, type = 'all') {
    const url = new URL('index.html', 'https://dolbomhannun.kr/'); // SOFTM-DOMAIN-MIGRATION 날짜:20261124 : 지역 기관 탐색을 새 공식 주소로 연결
    if (type !== 'all') url.searchParams.set('type', type);
    url.searchParams.set('p', properties.mapProvince || properties.province);
    if (properties.mapLegacyCity) url.searchParams.set('c', properties.mapLegacyCity);
    else if (!(properties.province === '인천광역시' && properties.region === '제물포구')) url.searchParams.set('q', properties.region); // SOFTM-CARE-GAP-INCHON 날짜:20261123 : 공단 주소가 개편 전 동구·중구로 남은 제물포구는 지역명 검색으로 기관을 모두 가리는 대신 인천 전체 목록을 연다.
    url.searchParams.set('mode', 'list');
    return `${url.pathname.slice(1)}${url.search}`;
}

export function guidedSearchUrl(properties, type = 'all') {
    const url = new URL('care-analysis.html', 'https://dolbomhannun.kr/'); // SOFTM-DOMAIN-MIGRATION 날짜:20261124 : 맞춤 분석 연결도 새 도메인으로 일치
    if (type !== 'all') url.searchParams.set('type', type === 'dementia' ? 'daycare' : type);
    return `${url.pathname.slice(1)}${url.search}`;
}

export function sortByPressure(features, heat, province = '', query = '') {
    const needle = String(query).replaceAll(/\s+/g, '').toLocaleLowerCase('ko');
    return features.filter(feature => {
        const p = feature.properties;
        return (!province || p.province === province) && (!needle || `${p.province}${p.region}`.replaceAll(/\s+/g, '').toLocaleLowerCase('ko').includes(needle));
    }).sort((left, right) => {
        const a = heat.get(left.properties.id), b = heat.get(right.properties.id);
        return (b?.percentile ?? 0) - (a?.percentile ?? 0)
            || (b?.value ?? 0) - (a?.value ?? 0)
            || left.properties.label.localeCompare(right.properties.label, 'ko'); // SOFTM-CARE-GAP-ZERO 날짜:20261123 : 같은 최고 색상 안에서도 기관 0곳의 무한 공급 압력을 유한 비율보다 먼저 안내
    });
}
/** SOFTM-CARE-GAP-ENGINE END */
