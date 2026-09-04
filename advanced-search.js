/** SOFTM-ADVANCED-SEARCH START 날짜:20260904 : 공단 상세조건을 두 지도에서 동일하게 판정하고 공유 링크에도 보존 */
(function (root) {
    'use strict';
    const OWNER_LABELS = ['미확인', '국가', '지방자치단체', '법인', '개인', '기타'];
    const GROUPS = [
        { id: 'dementia', label: '치매전담형 장기요양기관', options: [
            ['dementia-facility', '노인요양시설 내 치매전담실', ['facility', 'dementia']],
            ['dementia-home', '치매전담형 노인요양공동생활가정', ['facility', 'dementia']],
            ['dementia-daycare', '주야간보호 내 치매전담실', ['daycare', 'dementia']]
        ] },
        { id: 'cognitive', label: '인지활동형 프로그램 제공기관', options: [
            ['cognitive-home', '방문요양', ['home-care']],
            ['cognitive-daycare', '주야간보호', ['daycare']]
        ] },
        { id: 'first', label: '최초 치매수급자 방문간호 제공기관', options: [
            ['first-nursing', '최초 치매수급자 방문간호', ['home-nursing']]
        ] },
        { id: 'respite', label: '장기요양 가족휴가제 급여 제공기관', options: [
            ['respite-home', '종일 방문요양', ['home-care']],
            ['respite-short', '단기보호', ['short-stay']]
        ] },
        { id: 'integrated', label: '통합재가서비스', options: [
            ['integrated-daycare', '주야간보호형', ['daycare', 'home-care', 'home-nursing', 'home-bath']],
            ['integrated-home', '가정방문형', ['daycare', 'home-care', 'home-nursing', 'home-bath']]
        ] },
        { id: 'pilot', label: '시범사업', options: [
            ['short-pilot', '주야간보호기관 내 단기보호 시범사업', ['daycare']]
        ] },
        { id: 'green', label: '청구그린기관', note: '급여비용 청구 모범기관 여부이며, 돌봄 품질 등급과 다릅니다.', options: [['green', '청구그린기관']] },
        { id: 'panel', label: '장기요양기관 패널', note: '공단 경영실태조사 참여기관 중 명단 공개에 동의한 기관입니다.', options: [['panel', '장기요양기관 패널']] }
    ];
    const normalize = value => String(value ?? '').trim().replace(/[\s·ㆍ]/g, '').toLowerCase();
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const emptyState = () => ({ owner: '', facility: '', addressMode: 'dong', address: '', features: [] });
    const groupsFor = type => type === 'nursing-hospital' ? [] : GROUPS.map(group => ({ ...group, options: group.options.filter(option => !option[2] || option[2].includes(type) || type === 'dementia' && option[2].includes('daycare')) })).filter(group => group.options.length);

    function addressParts(row, mode) {
        const tokens = String(row.a || '').match(/[가-힣a-zA-Z0-9·]+/g) || [];
        return [...new Set(tokens.filter(token => mode === 'road'
            ? /(?:대로|로|길)$/.test(token)
            : token.length > 1 && /(?:읍|면|동|가)$/.test(token) && !/^\d+동$/.test(token)))];
    }

    function sanitize(input, type) {
        const state = { ...emptyState(), ...input };
        const allowed = new Set(groupsFor(type).flatMap(group => group.options.map(option => option[0])));
        state.features = [...new Set(Array.isArray(state.features) ? state.features : [])].filter(value => allowed.has(value));
        state.owner = type !== 'nursing-hospital' && ['', '0', '1', '2', '3', '4', '5'].includes(state.owner) ? state.owner : '';
        state.facility = type === 'facility' && ['facility', 'home'].includes(state.facility) ? state.facility : '';
        state.addressMode = state.addressMode === 'road' ? 'road' : 'dong';
        state.address = String(state.address || '').trim().slice(0, 80);
        return state;
    }

    function readState(params, type) {
        return sanitize({ owner: params.get('owner') || '', facility: params.get('facility') || '', addressMode: params.get('addressMode'), address: params.get('address') || '', features: (params.get('features') || '').split(',') }, type);
    }

    function writeState(params, state) {
        for (const key of ['owner', 'facility', 'addressMode', 'address', 'features']) params.delete(key);
        for (const key of ['owner', 'facility', 'address']) if (state[key] !== '') params.set(key, state[key]);
        if (state.address) params.set('addressMode', state.addressMode);
        if (state.features.length) params.set('features', [...state.features].sort().join(','));
    }

    function createMatcher(index, type) {
        const bits = Object.fromEntries((index?.features || []).map((key, position) => [key, 1 << position]));
        const groups = groupsFor(type);
        const hasFeature = (row, key) => Boolean((index?.records?.[row.i]?.[1] || 0) & bits[key]);
        function matches(row, state) {
            if (state.owner !== '' && String(index?.records?.[row.i]?.[0] || 0) !== state.owner) return false;
            const codes = String(row.t || '').split(',');
            if (state.facility === 'home' && !codes.some(code => ['A04', 'S41'].includes(code))) return false;
            if (state.facility === 'facility' && !codes.some(code => /^A0[1235]$/.test(code) || /^[GM]\d{2}$/.test(code))) return false;
            if (state.address && !addressParts(row, state.addressMode).some(value => normalize(value).includes(normalize(state.address)))) return false;
            return groups.every(group => {
                const selected = group.options.filter(option => state.features.includes(option[0]));
                return !selected.length || selected.some(option => hasFeature(row, option[0]));
            });
        }
        return { matches, hasFeature };
    }

    let indexTask;
    function loadIndex() {
        if (indexTask) return indexTask;
        indexTask = fetch(new URL('data/nhis/search-index.json.gz', document.baseURI), { cache: 'no-cache' }).then(async response => {
            if (!response.ok) throw new Error('상세검색 자료를 불러오지 못했습니다.');
            const bytes = new Uint8Array(await response.arrayBuffer());
            const text = bytes[0] === 31 && bytes[1] === 139
                ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
                : new TextDecoder().decode(bytes);
            const index = JSON.parse(text);
            if (index.schemaVersion !== 1 || !index.records || GROUPS.flatMap(group => group.options).some(option => !index.features?.includes(option[0]))) throw new Error('상세검색 자료 형식을 확인해 주세요.');
            return index;
        }).catch(error => { indexTask = null; throw error; });
        return indexTask;
    }

    async function mount({ host, type, rows, onChange, region }) {
        let state = readState(new URLSearchParams(location.search), type);
        let index = null;
        let loadError = false;
        const groups = groupsFor(type);
        host.innerHTML = '<p class="advanced-loading" role="status">상세검색 조건을 준비하고 있습니다.</p>';
        if (type !== 'nursing-hospital') {
            try { index = await loadIndex(); } catch (error) { loadError = true; }
        }
        const model = createMatcher(index, type);
        const hasDataFilter = () => state.owner !== '' || state.features.length > 0;
        const countActive = () => state.features.length + Number(state.owner !== '') + Number(Boolean(state.facility)) + Number(Boolean(state.address));
        const optionHtml = option => `<label class="advanced-option"><input type="checkbox" data-feature="${option[0]}" ${loadError ? 'disabled' : ''}><span>${escape(option[1])}</span><small>${loadError ? '—' : rows.filter(row => model.hasFeature(row, option[0])).length.toLocaleString()}곳</small></label>`;
        const groupHtml = group => `<fieldset class="advanced-group"><legend>${escape(group.label)}</legend>${group.options.length > 1 ? `<label class="advanced-parent"><input type="checkbox" data-group="${group.id}" ${loadError ? 'disabled' : ''}> 유형 전체</label>` : ''}<div class="advanced-options">${group.options.map(optionHtml).join('')}</div>${group.note ? `<p class="advanced-help">${escape(group.note)}</p>` : ''}</fieldset>`;
        const date = index?.sourceDate?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || '';
        host.innerHTML = `<details class="advanced-search"><summary>상세검색 <span class="advanced-count"></span><span class="advanced-summary-help">${type === 'nursing-hospital' ? '읍·면·동 · 도로명' : '설립주체 · 상세 주소 · 제공 서비스'}</span></summary><div class="advanced-body">
            <div class="advanced-toolbar"><p>현재 기관 유형에 해당하는 조건입니다. 변경하면 목록과 지도에 바로 적용됩니다.</p><button type="button" class="advanced-reset">상세조건 초기화</button></div>
            ${loadError ? '<p class="advanced-error" role="alert">공단 상세검색 자료를 불러오지 못했습니다. 설립주체·서비스 조건을 확인하려면 <button type="button" class="advanced-retry">다시 불러오기</button>를 눌러 주세요.</p>' : ''}
            <div class="advanced-basic">${type !== 'nursing-hospital' ? `<label>설립주체<select data-state="owner" ${loadError ? 'disabled' : ''}><option value="">전체</option>${OWNER_LABELS.slice(1).map((label, i) => `<option value="${i + 1}">${label}</option>`).join('')}<option value="0">미확인</option></select></label>` : ''}
            ${type === 'facility' ? '<label>시설급여 세부유형<select data-state="facility"><option value="">전체</option><option value="facility">노인요양시설</option><option value="home">노인요양공동생활가정</option></select></label>' : ''}
            <label>주소 구분<select data-state="addressMode"><option value="dong">읍·면·동</option><option value="road">도로명</option></select></label>
            <label class="advanced-address">상세 주소<input data-state="address" list="advanced-address-options" placeholder="읍·면·동 입력 또는 선택" autocomplete="off"><datalist id="advanced-address-options"></datalist></label></div>
            <p class="advanced-help">상세 주소는 선택 지역의 주소에 기록된 명칭으로 찾습니다.${type !== 'nursing-hospital' ? ' 설립주체 ‘미확인’은 공단 검색 자료에서 확인되지 않은 기관입니다.' : ''}</p>
            ${groups.length ? `<p class="advanced-logic">같은 묶음에서는 하나 이상, 서로 다른 묶음은 모두 충족하는 기관을 찾습니다. 각 조건 옆 기관 수는 현재 급여종류의 전국 기준입니다.</p><div class="advanced-groups">${groups.map(groupHtml).join('')}</div><p class="advanced-source">공단 검색 확인 ${date || '미완료'} · <a href="https://www.longtermcare.or.kr/npbs/r/a/201/selectLtcoSrch.web" target="_blank" rel="noopener">공단 조건 안내</a></p>` : ''}
            <p class="advanced-status" role="status" aria-live="polite"></p></div></details><div class="advanced-selected" aria-label="선택한 상세조건"></div>`;
        const control = key => host.querySelector(`[data-state="${key}"]`);
        function suggestions() {
            const area = region();
            const values = new Set(rows.filter(row => (!area.province || row.p === area.province) && (!area.city || row.c === area.city)).flatMap(row => addressParts(row, state.addressMode)));
            host.querySelector('datalist').innerHTML = [...values].sort((a, b) => a.localeCompare(b, 'ko')).map(value => `<option value="${escape(value)}"></option>`).join('');
            control('address').placeholder = state.addressMode === 'road' ? '도로명 입력 또는 선택' : '읍·면·동 입력 또는 선택';
        }
        function sync() {
            for (const key of ['owner', 'facility', 'addressMode', 'address']) if (control(key)) control(key).value = state[key];
            host.querySelectorAll('[data-feature]').forEach(input => { input.checked = state.features.includes(input.dataset.feature); });
            host.querySelectorAll('[data-group]').forEach(input => {
                const options = groups.find(group => group.id === input.dataset.group).options;
                const count = options.filter(option => state.features.includes(option[0])).length;
                input.checked = count === options.length;
                input.indeterminate = count > 0 && count < options.length;
            });
            host.querySelector('.advanced-count').textContent = countActive() ? `${countActive()}개 선택` : '';
            const selected = [];
            if (state.owner !== '') selected.push(['owner', `설립주체: ${OWNER_LABELS[Number(state.owner)]}`]);
            if (state.facility) selected.push(['facility', state.facility === 'home' ? '노인요양공동생활가정' : '노인요양시설']);
            if (state.address) selected.push(['address', `${state.addressMode === 'road' ? '도로명' : '읍·면·동'}: ${state.address}`]);
            for (const group of groups) for (const option of group.options) if (state.features.includes(option[0])) selected.push([option[0], `${group.label === option[1] ? '' : group.label + ' · '}${option[1]}`]);
            host.querySelector('.advanced-selected').innerHTML = selected.map(([key, label]) => `<button type="button" data-remove="${key}" aria-label="${escape(label)} 조건 해제">${escape(label)} <span aria-hidden="true">×</span></button>`).join('');
            const count = rows.filter(row => model.matches(row, state)).length;
            host.querySelector('.advanced-status').textContent = loadError && hasDataFilter() ? '선택한 공단 조건을 확인할 수 없어 결과를 표시하지 않습니다. 다시 불러오거나 상세조건을 초기화해 주세요.' : `상세조건에 맞는 기관: 전국 ${count.toLocaleString()}곳 · 지도·지역·등급 조건은 추가로 적용됩니다.`;
        }
        function changed() { sync(); onChange(); }
        host.addEventListener('change', event => {
            const input = event.target;
            if (input.dataset.state) {
                state[input.dataset.state] = input.value.trim();
                if (input.dataset.state === 'addressMode') { state.address = ''; suggestions(); }
            } else if (input.dataset.feature) {
                state.features = state.features.filter(key => key !== input.dataset.feature);
                if (input.checked) state.features.push(input.dataset.feature);
            } else if (input.dataset.group) {
                const keys = groups.find(group => group.id === input.dataset.group).options.map(option => option[0]);
                state.features = state.features.filter(key => !keys.includes(key));
                if (input.checked) state.features.push(...keys);
            } else return;
            changed();
        });
        let inputTimer;
        control('address').addEventListener('input', event => {
            state.address = event.target.value.trim().slice(0, 80);
            clearTimeout(inputTimer);
            inputTimer = setTimeout(changed, 180);
        });
        host.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.matches('.advanced-reset')) { state = emptyState(); suggestions(); changed(); }
            else if (button.dataset.remove) {
                const key = button.dataset.remove;
                if (['owner', 'facility', 'address'].includes(key)) state[key] = '';
                else state.features = state.features.filter(value => value !== key);
                changed();
            } else if (button.matches('.advanced-retry')) location.reload();
        });
        for (const id of ['province', 'city']) document.getElementById(id)?.addEventListener('change', () => {
            state.address = '';
            suggestions();
            changed();
        });
        sync();
        suggestions();
        if (countActive()) host.querySelector('details').open = true;
        return { matches: row => !(loadError && hasDataFilter()) && model.matches(row, state), write: params => writeState(params, state), state: () => ({ ...state, features: [...state.features] }) };
    }
    const api = { mount, createMatcher, readState, writeState, sanitize, addressParts, groupsFor, emptyState };
    root.CareAdvancedSearch = Object.freeze(api);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-ADVANCED-SEARCH END */
