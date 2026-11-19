/** SOFTM-GUIDED-COMPARE START 날짜:20261119 : 여러 후보는 보관하되 실제 선택은 세 곳에 집중하고 지도와 맞춤분석이 같은 공개정보 해석을 사용 */
(function (root) {
    'use strict';

    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const numeric = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const institutionTypes = new Set(['facility', 'daycare', 'short-stay', 'dementia']);
    const staffTypes = new Set(['facility', 'daycare', 'home-care', 'home-nursing', 'home-bath', 'short-stay', 'dementia']);

    function createSelection(storage, type, maximum = 3) {
        const key = `careCompareActive:v1:${type}`;
        let ids = [];
        try {
            const saved = JSON.parse(storage?.getItem(key) || '[]');
            if (Array.isArray(saved)) ids = [...new Set(saved.map(String))].slice(0, maximum);
        } catch {}
        const save = () => { try { storage?.setItem(key, JSON.stringify(ids)); } catch {} };
        const availableIds = values => [...new Set(values.map(value => String(value?.i ?? value)).filter(Boolean))];
        return {
            ids: () => [...ids],
            sync(values, fill = true) {
                const available = availableIds(values), allowed = new Set(available);
                ids = ids.filter(id => allowed.has(id)).slice(0, maximum);
                if (fill) for (const id of available) if (ids.length < maximum && !ids.includes(id)) ids.push(id);
                save();
                return [...ids];
            },
            toggle(value, values) {
                const id = String(value), available = new Set(availableIds(values));
                if (!available.has(id)) return { changed: false, reason: 'missing', ids: [...ids] };
                if (ids.includes(id)) {
                    ids = ids.filter(item => item !== id); save();
                    return { changed: true, ids: [...ids] };
                }
                if (ids.length >= maximum) return { changed: false, reason: 'limit', ids: [...ids] };
                ids = [...ids, id]; save();
                return { changed: true, ids: [...ids] };
            },
            clear() { ids = []; save(); }
        };
    }

    function evaluation(row, type, source) {
        if (type === 'nursing-hospital' || source === 'hira') return { value: '심평원 개설현황', note: '장기요양기관 평가와 다른 자료', tone: 'neutral' };
        const grade = row.g || row.ev?.grade, year = row.ey || row.ev?.year;
        if (/^[A-E]$/.test(grade || '')) return { value: `${grade}등급`, note: year ? `${year}년 기관 평가` : '평가연도 미확인', tone: 'confirmed' };
        if (grade === 'N') return { value: '신설·미평가', note: '낮은 평가를 뜻하지 않음', tone: 'neutral' };
        return { value: '미확인', note: '낮은 평가를 뜻하지 않음', tone: 'unknown' };
    }

    function metricsFor(type, source = 'nhis') {
        const metrics = [{ key: 'distance', label: '기준지 거리', help: '직선거리' }];
        if (type !== 'nursing-hospital' && source !== 'hira') metrics.push({ key: 'evaluation', label: '공공 평가', help: '평가연도 함께 확인' });
        if (institutionTypes.has(type)) metrics.push({ key: 'capacity', label: '공개 정원', help: '빈자리와 다름' });
        if (staffTypes.has(type)) metrics.push({ key: 'nursing', label: '간호 인력', help: '공개 인력 현황' }, { key: 'caregiver', label: '요양보호사', help: '공개 인력 현황' });
        metrics.push({ key: 'designated', label: type === 'nursing-hospital' ? '개설일' : '지정·개설일', help: '공개자료 기준' });
        if (type === 'welfare-equipment') metrics.push({ key: 'availability', label: '품목·배송', help: '재고와 배송지역' });
        else if (type === 'nursing-hospital') metrics.push({ key: 'availability', label: '입원 가능 여부', help: '병실·진료 확인' });
        else metrics.push({ key: 'availability', label: '이용 가능 여부', help: '빈자리·대기기간' });
        metrics.push({ key: 'cost', label: '예상 비용', help: '급여·비급여 확인' });
        return metrics;
    }

    function metricValue(row, metric, options = {}) {
        const { type, source } = options;
        if (metric.key === 'distance') {
            const distance = numeric(row._distance);
            return distance === null ? { value: '미확인', note: '기준 위치 필요', tone: 'unknown' } : { value: `${distance.toFixed(1)}km`, note: '실제 이동시간 별도 확인', tone: 'confirmed' };
        }
        if (metric.key === 'evaluation') return evaluation(row, type, source);
        if (metric.key === 'capacity') {
            const capacity = numeric(row.z);
            return capacity !== null && capacity > 0 ? { value: `${capacity}명`, note: '현재 빈자리 아님', tone: 'confirmed' } : { value: '미확인', note: '기관에 확인', tone: 'unknown' };
        }
        if (metric.key === 'nursing') {
            if (row.staffMissing) return { value: '일부 미확인', note: '기관에 현재 배치 확인', tone: 'unknown' };
            const registered = numeric(row.rn), assistant = numeric(row.na);
            if (registered === null && assistant === null) return { value: '미확인', note: '기관에 현재 배치 확인', tone: 'unknown' }; // SOFTM-STAFF-UNKNOWN 날짜:20261120 : 간호 인력 두 항목이 모두 비어 있을 때 0명으로 추정하지 않음
            const count = (registered || 0) + (assistant || 0);
            return { value: `${count}명`, note: '공개 인력 현황', tone: 'confirmed' };
        }
        if (metric.key === 'caregiver') {
            if (row.staffMissing) return { value: '일부 미확인', note: '기관에 현재 배치 확인', tone: 'unknown' };
            const count = numeric(row.cw);
            return count === null ? { value: '미확인', note: '기관에 현재 배치 확인', tone: 'unknown' } : { value: `${count}명`, note: '공개 인력 현황', tone: 'confirmed' };
        }
        if (metric.key === 'designated') return row.d ? { value: String(row.d), note: '공개자료 표시일', tone: 'confirmed' } : { value: '미확인', note: '기관에 확인', tone: 'unknown' };
        if (metric.key === 'availability') return { value: '기관 확인 필요', note: type === 'welfare-equipment' ? '재고·배송은 실시간 정보 아님' : '공개 정원은 빈자리가 아님', tone: 'verify' };
        if (metric.key === 'cost') return { value: '기관 확인 필요', note: '본인부담·비급여 별도 확인', tone: 'verify' };
        return { value: '미확인', note: '', tone: 'unknown' };
    }

    function render(options = {}) {
        const allRows = Array.isArray(options.allRows) ? options.allRows : [], active = new Set((options.activeIds || []).map(String));
        const rows = (Array.isArray(options.rows) ? options.rows : []).slice(0, 3), count = Math.max(rows.length, 1);
        const type = options.type || 'daycare', source = options.source || (type === 'nursing-hospital' ? 'hira' : 'nhis');
        const metrics = metricsFor(type, source), selectedCriteria = Array.isArray(options.selectedCriteria) ? options.selectedCriteria.filter(Boolean) : [];
        const policy = root.CareCompareEvidence?.build?.(rows, { source, sourceDate: options.sourceDate });
        const picker = allRows.length ? `<section class="care-compare-picker" aria-labelledby="careComparePickerTitle"><div><strong id="careComparePickerTitle">비교할 시설 선택</strong><span>${allRows.length}곳 보관 · 최대 3곳 비교</span></div><div class="care-compare-picker-list">${allRows.map(row => `<button type="button" data-comparison-select="${escape(row.i)}" aria-pressed="${active.has(String(row.i))}">${escape(row.n)}</button>`).join('')}</div></section>` : '';
        const empty = rows.length < 2 ? `<div class="care-compare-empty" role="status"><strong>시설을 2곳 이상 선택해 주세요.</strong><p>보관한 후보는 그대로 두고 한 번에 최대 3곳을 비교할 수 있습니다.</p></div>` : '';
        const heads = rows.length >= 2 ? `<div class="care-compare-matrix care-compare-head-row" style="--care-compare-count:${count}" role="row"><div class="care-compare-label" role="columnheader">비교 지표</div>${rows.map((row, index) => `<article class="care-compare-facility" role="columnheader"><span>${index + 1}</span><h3>${escape(row.n)}</h3><p>${escape(row.a || '주소 미확인')}</p><button type="button" data-comparison-detail="${escape(row.i)}">상세 보기</button></article>`).join('')}</div>` : '';
        const body = rows.length >= 2 ? metrics.map(metric => `<div class="care-compare-matrix care-compare-metric-row" style="--care-compare-count:${count}" role="row"><div class="care-compare-label" role="rowheader"><strong>${escape(metric.label)}</strong><span>${escape(metric.help)}</span></div>${rows.map(row => { const value = metricValue(row, metric, { type, source }); return `<div class="care-compare-value" data-tone="${value.tone}" role="cell"><strong>${escape(value.value)}</strong><span>${escape(value.note)}</span></div>`; }).join('')}</div>`).join('') : '';
        const evidence = policy ? root.CareCompareEvidence.render(policy) : `<p>자료 출처와 기준일을 함께 확인하세요.</p>`;
        return `<section class="care-compare-workspace" aria-label="선택 시설 비교">${picker}<div class="care-compare-layout"><div class="care-compare-main" role="table">${empty}${heads}${body}</div><aside class="care-compare-guide"><span class="care-compare-guide-icon" aria-hidden="true">i</span><h3>비교표 읽는 법</h3><div class="care-compare-policy">${evidence}</div>${selectedCriteria.length ? `<div class="care-compare-criteria"><strong>확인 중인 조건</strong><p>${selectedCriteria.map(escape).join(' · ')}</p></div>` : ''}<ul><li>평가연도가 다르면 등급·총점을 순위로 보지 않습니다.</li><li>미확인은 낮은 평가나 서비스 미제공을 뜻하지 않습니다.</li><li>빈자리·대기기간·추가 비용은 기관에 직접 확인합니다.</li></ul></aside></div></section>`;
    }

    root.CareComparisonWorkspace = Object.freeze({ createSelection, metricsFor, metricValue, render });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-GUIDED-COMPARE END */
