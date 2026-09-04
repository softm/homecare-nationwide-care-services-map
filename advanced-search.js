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

    async function mount({ host, type, rows, onChange, region, resultTarget }) { // SOFTM-SEARCH-FEEDBACK 날짜:20260904 : 실제 조회 결과를 알리고 같은 결과 영역으로 이동하도록 연결
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
            <p class="advanced-status">현재 조회 결과를 준비하고 있습니다.</p></div></details><div class="advanced-selected" aria-label="선택한 상세조건"></div>`; // SOFTM-SEARCH-FEEDBACK 날짜:20260904 : 전국 예상 수와 실제 조회 결과를 혼동하거나 안내를 중복해서 읽지 않도록 분리
        const control = key => host.querySelector(`[data-state="${key}"]`);
        /** SOFTM-SEARCH-FEEDBACK START 날짜:20260904 : 조건 조작부터 실제 반영 완료까지 두 지도에서 동일한 피드백을 제공 */
        const notice = document.createElement('div');
        notice.className = 'advanced-feedback';
        notice.hidden = true;
        notice.innerHTML = '<div class="advanced-feedback-copy"><strong class="advanced-feedback-title"></strong><p class="advanced-feedback-detail"></p></div><div class="advanced-feedback-track" role="progressbar" aria-label="상세조건 조회 진행"><span></span></div><div class="advanced-feedback-actions"><button type="button" class="advanced-feedback-view">결과 보기</button><button type="button" class="advanced-feedback-close" aria-label="조회 알림 닫기">×</button></div>';
        const live = document.createElement('div');
        live.className = 'advanced-feedback-live';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        document.body.append(notice, live);
        const noticeTitle = notice.querySelector('.advanced-feedback-title');
        const noticeDetail = notice.querySelector('.advanced-feedback-detail');
        const progressTrack = notice.querySelector('.advanced-feedback-track');
        const progressBar = progressTrack.querySelector('span');
        const viewButton = notice.querySelector('.advanced-feedback-view');
        const closeButton = notice.querySelector('.advanced-feedback-close');
        let generation = 0;
        let hideTimer;
        let inputTimer;
        let pending = false;
        let returnFocus = null;
        const signature = () => JSON.stringify([state.owner, state.facility, state.address ? state.addressMode : '', normalize(state.address), [...state.features].sort()]);
        let lastSignature = signature();
        const setBusy = value => resultTarget?.setAttribute('aria-busy', String(value));
        function hideNotice(restoreFocus = false) {
            clearTimeout(hideTimer);
            const focused = notice.contains(document.activeElement);
            notice.hidden = true;
            if (restoreFocus && focused) (returnFocus?.isConnected ? returnFocus : host.querySelector('summary')).focus({ preventScroll: true });
        }
        function scheduleHide() {
            clearTimeout(hideTimer);
            if (!pending && !notice.contains(document.activeElement) && !notice.matches(':hover')) hideTimer = setTimeout(() => hideNotice(), 4000);
        }
        function cancel() {
            generation++;
            clearTimeout(inputTimer);
            pending = false;
            setBusy(false);
            hideNotice(true);
            live.textContent = '';
        }
        function describe(outcome) {
            const count = Math.max(0, Number(outcome.count) || 0);
            const partial = Boolean(outcome.partial || outcome.unresolved);
            const title = `조회 결과 ${count.toLocaleString()}곳`;
            const details = [];
            if (outcome.scope) details.push(outcome.scope);
            if (!outcome.mapReady) details.push('지도 연결 전 · 목록 조회 완료');
            else if (Number.isFinite(outcome.markerCount) && outcome.markerCount !== count) details.push(`지도 표시 ${outcome.markerCount.toLocaleString()}곳`);
            if (outcome.unresolved) details.push(`위치 미확인 ${Number(outcome.unresolved).toLocaleString()}곳 포함`);
            else if (outcome.partial) details.push('일부 자료만 확인했습니다.');
            if (count === 0 && !partial) details.push('조건에 맞는 기관이 없습니다. 조건을 줄여 다시 조회해 주세요.');
            return { title, detail: details.join(' · '), partial, count };
        }
        function report(outcome) {
            if (!outcome || outcome.cancelled) return;
            const result = describe(outcome);
            host.querySelector('.advanced-status').textContent = [result.title, result.detail].filter(Boolean).join(' · ');
        }
        function updateProgress(token, { current, total, message } = {}) {
            if (token !== generation) return;
            const determinate = Number.isFinite(current) && Number.isFinite(total) && total > 0;
            notice.classList.toggle('indeterminate', !determinate);
            noticeDetail.textContent = message || '선택한 조건으로 목록과 지도를 확인하고 있습니다.';
            if (determinate) {
                const value = Math.max(0, Math.min(total, current));
                progressTrack.setAttribute('aria-valuemin', '0');
                progressTrack.setAttribute('aria-valuemax', String(total));
                progressTrack.setAttribute('aria-valuenow', String(value));
                progressBar.style.width = `${value / total * 100}%`;
                noticeDetail.textContent += ` · ${value.toLocaleString()}/${total.toLocaleString()}곳`;
            } else {
                for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow']) progressTrack.removeAttribute(name);
                progressBar.style.width = '';
            }
        }
        viewButton.addEventListener('click', () => {
            if (!resultTarget) return;
            hideNotice();
            if (!resultTarget.hasAttribute('tabindex')) resultTarget.setAttribute('tabindex', '-1');
            resultTarget.focus({ preventScroll: true });
            const offset = (document.querySelector('.category-nav')?.getBoundingClientRect().height || 0) + 16;
            window.scrollTo({ top: window.scrollY + resultTarget.getBoundingClientRect().top - offset, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        });
        closeButton.addEventListener('click', () => hideNotice(true));
        notice.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        notice.addEventListener('mouseleave', scheduleHide);
        notice.addEventListener('focusin', () => clearTimeout(hideTimer));
        notice.addEventListener('focusout', () => setTimeout(scheduleHide, 0));
        /** SOFTM-SEARCH-FEEDBACK END */
        function suggestions() {
            const area = region();
            const values = new Set(rows.filter(row => (!area.province || row.p === area.province) && (!area.city || row.c === area.city)).flatMap(row => addressParts(row, state.addressMode)));
            host.querySelector('datalist').innerHTML = [...values].sort((a, b) => a.localeCompare(b, 'ko')).map(value => `<option value="${escape(value)}"></option>`).join('');
            control('address').placeholder = state.addressMode === 'road' ? '도로명 입력 또는 선택' : '읍·면·동 입력 또는 선택';
        }
        function sync() {
            /** SOFTM-SEARCH-FOCUS START 날짜:20260904 : 조건칩을 다시 그려도 키보드로 이어서 해제할 수 있도록 포커스를 보존 */
            const activeChip = document.activeElement?.closest('[data-remove]');
            const chipKey = activeChip && host.contains(activeChip) ? activeChip.dataset.remove : null;
            const chipPosition = chipKey ? [...host.querySelectorAll('[data-remove]')].indexOf(activeChip) : -1;
            /** SOFTM-SEARCH-FOCUS END */
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
            /** SOFTM-SEARCH-FOCUS START 날짜:20260904 : 사라진 조건칩은 옆 칩 또는 초기화 버튼으로 안전하게 포커스를 넘김 */
            if (chipKey) {
                const chips = [...host.querySelectorAll('[data-remove]')];
                const next = chips.find(button => button.dataset.remove === chipKey) || chips[Math.min(chipPosition, chips.length - 1)] || host.querySelector('.advanced-reset');
                next.focus({ preventScroll: true });
            }
            if (loadError && hasDataFilter()) host.querySelector('.advanced-status').textContent = '선택한 공단 조건을 확인할 수 없어 결과를 표시하지 않습니다. 다시 불러오거나 상세조건을 초기화해 주세요.';
            /** SOFTM-SEARCH-FOCUS END */
        }
        /** SOFTM-SEARCH-FEEDBACK START 날짜:20260904 : 마지막 조건의 실제 완료만 알리고 빠른 조회에서도 진행 표시를 인지하게 함 */
        async function changed() {
            clearTimeout(inputTimer);
            const nextSignature = signature();
            if (nextSignature === lastSignature) return;
            lastSignature = nextSignature;
            sync();
            const token = ++generation;
            const started = performance.now();
            const isCurrent = () => token === generation;
            pending = true;
            returnFocus = document.activeElement;
            clearTimeout(hideTimer);
            notice.className = 'advanced-feedback pending indeterminate';
            notice.hidden = false;
            progressTrack.hidden = false;
            viewButton.hidden = true;
            closeButton.hidden = true;
            noticeTitle.textContent = '상세조건 적용 중…';
            updateProgress(token);
            setBusy(true);
            host.querySelector('.advanced-status').textContent = '선택한 상세조건으로 조회하고 있습니다.';
            live.textContent = '상세조건을 적용하고 있습니다.';
            try {
                const outcome = await onChange({ isCurrent, progress: value => updateProgress(token, value) });
                if (!isCurrent()) return;
                if (outcome?.cancelled) { cancel(); return; }
                if (!outcome || !Number.isFinite(outcome.count)) throw new Error('조회 결과를 확인하지 못했습니다.');
                report(outcome);
                setBusy(false);
                await new Promise(resolve => setTimeout(resolve, Math.max(0, 300 - (performance.now() - started))));
                if (!isCurrent()) return;
                pending = false;
                const result = describe(outcome);
                notice.className = `advanced-feedback ${result.partial ? 'warning' : result.count === 0 ? 'empty' : 'success'}`;
                noticeTitle.textContent = result.partial ? result.title : `조건 적용 완료 · ${result.title}`;
                noticeDetail.textContent = result.detail || '목록과 지도에 반영했습니다.';
                progressTrack.hidden = true;
                viewButton.hidden = !resultTarget;
                closeButton.hidden = false;
                live.textContent = `${noticeTitle.textContent} ${noticeDetail.textContent}`;
                scheduleHide();
            } catch (error) {
                if (!isCurrent()) return;
                pending = false;
                setBusy(false);
                notice.className = 'advanced-feedback error';
                noticeTitle.textContent = '조건을 적용하지 못했습니다.';
                noticeDetail.textContent = '잠시 후 조건을 다시 선택해 주세요.';
                progressTrack.hidden = true;
                viewButton.hidden = true;
                closeButton.hidden = false;
                host.querySelector('.advanced-status').textContent = `${noticeTitle.textContent} ${noticeDetail.textContent}`;
                live.textContent = host.querySelector('.advanced-status').textContent;
                scheduleHide();
            }
        }
        /** SOFTM-SEARCH-FEEDBACK END */
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
        control('address').addEventListener('input', event => {
            state.address = event.target.value.trim().slice(0, 80);
            clearTimeout(inputTimer);
            if (signature() !== lastSignature) cancel(); // SOFTM-SEARCH-FEEDBACK 날짜:20260904 : 새 주소를 입력하는 동안 이전 조회의 완료 알림을 남기지 않음
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
        /** SOFTM-SEARCH-REGION START 날짜:20260904 : 기본 지역조회가 한 번만 실행되면서 새 지역의 상세주소 조건을 사용하도록 먼저 정리 */
        for (const id of ['province', 'city']) document.getElementById(id)?.addEventListener('change', () => {
            clearTimeout(inputTimer);
            cancel();
            state.address = '';
            suggestions();
            sync();
            lastSignature = signature();
        }, true);
        /** SOFTM-SEARCH-REGION END */
        sync();
        suggestions();
        if (countActive()) host.querySelector('details').open = true;
        return { matches: row => !(loadError && hasDataFilter()) && model.matches(row, state), write: params => writeState(params, state), state: () => ({ ...state, features: [...state.features] }), report, cancel }; // SOFTM-SEARCH-FEEDBACK 날짜:20260904 : 기본조회 완료와 상세조회 취소도 공용 상태에 반영
    }
    const api = { mount, createMatcher, readState, writeState, sanitize, addressParts, groupsFor, emptyState };
    root.CareAdvancedSearch = Object.freeze(api);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-ADVANCED-SEARCH END */
