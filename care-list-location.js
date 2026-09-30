/** SOFTM-LIST-LOCATION START 날짜:20260930 : 접속 위치 확인과 명시적인 지역 검색을 분리해 기존 검색조건을 자동으로 덮지 않음 */
(function (root) {
    'use strict';

    function resolveRegion(address, rows, regionKey, bounds) {
        const key = regionKey(address?.province, address?.city);
        const [province, normalizedCity] = key.split('|');
        if (!bounds?.[`${province}|`] || !normalizedCity) throw new Error('현재 위치의 국내 시·군·구를 확인하지 못했습니다. 지역을 직접 선택해 주세요.');
        const exact = rows.find(row => regionKey(row.p, row.c) === key);
        if (exact) return { province: exact.p, city: exact.c };
        const parent = String(address.city || '').split(/\s+/)[0];
        const parentRow = /시$/.test(parent) && rows.find(row => regionKey(row.p, row.c) === regionKey(province, parent));
        if (parentRow) return { province: parentRow.p, city: parentRow.c };
        return { province, city: province === '세종특별자치시' ? '세종시' : address.city.trim() };
    }

    function createController(options) {
        let revision = 0, attempted = false, state = { phase: 'idle', label: '위치 확인 전', message: '', reason: '' };
        const update = patch => { state = { ...state, ...patch }; options.render(state); };
        async function locate(search = false) {
            const token = ++revision, signature = options.signature();
            const current = () => token === revision && options.enabled();
            attempted = true;
            update({ result: null, requested: search, phase: 'loading', label: '현재 위치 확인 중…', shortLabel: '', message: '', reason: '', fullAddress: '' }); // SOFTM-LOCATION-TOOLBAR 날짜:20260930 : 재확인 중 지난 주소를 현재 접속 위치로 오인하지 않도록 함께 비움
            let point;
            try {
                point = await options.locate({ isCurrent: current });
                if (!current()) return { cancelled: true };
                const coordinates = `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
                update({ label: `위치 확인됨 · ${coordinates}`, message: '지역명을 확인하고 있습니다…' });
                const address = await options.describe(point);
                if (!current()) return { cancelled: true };
                const label = [address?.province, address?.city, address?.neighborhood].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(' ');
                if (!label) throw new Error('지역명을 확인하지 못했습니다. 다시 시도하거나 지역을 직접 선택해 주세요.');
                update({ phase: search ? 'searching' : 'ready', label, shortLabel: [address.city, address.neighborhood].filter(Boolean).join(' ') || label, fullAddress: address.fullAddress || address.address || label, message: '현재 위치의 시·군·구에서 검색합니다.' }); // SOFTM-LOCATION-TOOLBAR 날짜:20260930 : 검색 도구에는 짧은 지역명을 표시하고 전체 주소는 상세 안내에 보존
                if (!search) return { point, address };
                if (signature !== options.signature()) {
                    update({ phase: 'ready', message: '검색조건이 바뀌어 위치 검색을 취소했습니다. 다시 눌러 주세요.' }); // SOFTM-LOCATION-RESULT 날짜:20260930 : 조회 전 조건 변경을 진행 상태와 구분
                    return { cancelled: true };
                }
                update({ phase: 'searching', message: '현재 위치의 기관을 찾고 있습니다…' });
                const outcome = await options.apply(address);
                if (!current()) return { cancelled: true };
                /** SOFTM-LOCATION-RESULT START 날짜:20260930 : 실제 조회 성공에서만 적용 지역·건수를 완료 상태로 보관 */
                update({ result: outcome?.cancelled ? null : { scope: outcome.scope, count: outcome.count }, phase: 'ready', message: outcome?.cancelled ? '검색조건이 바뀌어 위치 검색을 취소했습니다.' : `${outcome.scope} · ${outcome.count.toLocaleString('ko-KR')}곳 검색 완료` });
                /** SOFTM-LOCATION-RESULT END */
                return outcome;
            } catch (error) {
                if (!current()) return { cancelled: true };
                const detail = point ? { title: state.label, message: error.message, reason: '' } : options.errorInfo(error);
                update({ phase: 'error', label: detail.title, message: detail.message, reason: detail.reason });
                return { error };
            }
        }
        /** SOFTM-LOCATION-RESULT START 날짜:20260930 : 새 조회에서 이전 내 위치 검색 완료 표시가 남아 현재 결과로 오인되지 않도록 해제 */
        function clearResult() {
            if (state.result || state.requested && !['loading', 'searching'].includes(state.phase)) update({ result: null, requested: false, message: '현재 위치의 시·군·구에서 검색할 수 있습니다.' });
        }
        /** SOFTM-LOCATION-RESULT END */
        function sync() {
            if (!options.enabled()) {
                revision++; clearResult(); // SOFTM-LOCATION-RESULT 날짜:20260930 : 지도 전환 뒤 목록의 이전 완료 표시를 재사용하지 않음
                if (['loading', 'searching'].includes(state.phase)) { attempted = false; update({ phase: 'idle', label: '위치 확인 전', message: '' }); }
            } else if (!attempted) void locate();
        }
        return { locate, sync, clearResult, state: () => ({ ...state }) }; // SOFTM-LOCATION-RESULT 날짜:20260930 : 새 조회에 완료 표시 해제 경로를 제공
    }

    function mount(options) {
        /** SOFTM-LOCATION-TOOLBAR START 날짜:20260930 : 위치 검색과 주소·권한 안내를 검색조건 옆 한 컨트롤로 묶어 실행 목적을 분명하게 제공 */
        const host = root.document.createElement('section');
        host.id = 'careListLocation'; host.setAttribute('aria-label', '현재 위치로 기관 찾기');
        host.innerHTML = '<button type="button" data-list-locate aria-label="현재 위치에서 기관 찾기" title="현재 위치의 시·군·구에서 기관 찾기"><svg class="care-location-target" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg><span data-location-action-full>내 위치로 찾기</span><span data-location-action-short aria-hidden="true">내 위치</span></button><button type="button" data-list-location-help aria-label="현재 위치 상세 안내" aria-haspopup="dialog"><span data-location-label>위치 정보</span><svg class="care-location-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><span class="care-list-location-announcement" data-location-message role="status" aria-live="polite" aria-atomic="true"></span>';
        const toolbar = root.document.querySelector('.stitch-filter-toolbar');
        if (toolbar) toolbar.insertBefore(host, toolbar.querySelector('.stitch-reset'));
        else root.document.querySelector('.filters')?.append(host);
        const button = host.querySelector('[data-list-locate]'), help = host.querySelector('[data-list-location-help]');
        /** SOFTM-LOCATION-RESULT START 날짜:20260930 : 스크롤 중에도 결과 제목 옆에서 위치 검색 진행·완료·실패를 명확히 확인 */
        const feedback = root.document.createElement('div');
        feedback.className = 'care-location-result'; feedback.hidden = true;
        feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.setAttribute('aria-atomic', 'true');
        feedback.innerHTML = '<strong data-location-result-title></strong><span data-location-result-detail></span>';
        root.document.querySelector('.results .list-head')?.append(feedback);
        /** SOFTM-LOCATION-RESULT END */
        const searchHere = () => { root.CareLocation.hideNotice(); void controller.locate(true); };
        let detailDialog;
        function showDetails(state) {
            if (state.phase === 'error' && state.reason) {
                root.CareLocation.showNotice({ reason: state.reason }, searchHere);
                return;
            }
            if (!detailDialog) {
                detailDialog = root.document.createElement('dialog');
                detailDialog.className = 'care-list-location-dialog';
                detailDialog.setAttribute('aria-labelledby', 'careListLocationDetailTitle');
                detailDialog.innerHTML = '<h2 id="careListLocationDetailTitle">현재 접속 위치</h2><p data-location-detail-address></p><p data-location-detail-message></p><div><button type="button" data-location-detail-retry>현재 위치 다시 확인</button><button type="button" data-location-detail-close>닫기</button></div>';
                root.document.body.append(detailDialog);
                detailDialog.querySelector('[data-location-detail-close]').onclick = () => detailDialog.close();
                detailDialog.querySelector('[data-location-detail-retry]').onclick = () => { detailDialog.close(); void controller.locate(false); };
                detailDialog.addEventListener('close', () => help.focus({ preventScroll: true }));
            }
            detailDialog.querySelector('h2').textContent = state.phase === 'error' ? '현재 위치 안내' : '현재 접속 위치';
            detailDialog.querySelector('[data-location-detail-address]').textContent = state.fullAddress || state.label;
            detailDialog.querySelector('[data-location-detail-message]').textContent = state.message || '현재 위치의 시·군·구에서 기관을 찾을 수 있습니다.';
            detailDialog.querySelector('[data-location-detail-retry]').disabled = ['loading', 'searching'].includes(state.phase);
            if (!detailDialog.open) detailDialog.showModal();
        }
        const controller = createController({
            ...options,
            locate: config => root.CareLocation.request(config), errorInfo: error => root.CareLocation.info(error),
            render(state) {
                host.dataset.phase = state.phase;
                /** SOFTM-LOCATION-RESULT START 날짜:20260930 : 주소 확인만으로 완료를 표시하지 않고 실제 조회 결과와 적용 지역을 강조 */
                const applied = Boolean(state.result), busy = ['loading', 'searching'].includes(state.phase);
                host.dataset.applied = String(applied);
                feedback.hidden = !applied && !state.requested;
                feedback.dataset.state = applied ? 'success' : busy ? 'pending' : 'error';
                feedback.querySelector('[data-location-result-title]').textContent = applied ? '✓ 내 위치 기준 조회 완료' : busy ? '내 위치로 조회 중…' : state.phase === 'error' ? '내 위치 조회 실패' : '내 위치 조회 취소';
                feedback.querySelector('[data-location-result-detail]').textContent = applied ? `${state.result.scope} · ${state.result.count.toLocaleString('ko-KR')}곳${state.result.count === 0 ? ' · 현재 조건에 맞는 기관이 없습니다.' : ''}` : busy ? state.phase === 'loading' ? '현재 위치를 확인하고 있습니다.' : '확인한 시·군·구의 기관을 검색하고 있습니다.' : state.message;
                button.setAttribute('aria-label', applied ? '내 위치 기준 조회 적용됨, 다시 찾기' : '현재 위치에서 기관 찾기');
                /** SOFTM-LOCATION-RESULT END */
                const label = host.querySelector('[data-location-label]');
                const shortError = ['denied', 'policy'].includes(state.reason) ? '권한 안내' : state.reason === 'timeout' ? '지연 안내' : '확인 안내';
                label.textContent = state.phase === 'error' ? shortError : state.phase === 'loading' ? '확인 중' : state.shortLabel || '위치 정보';
                help.title = [state.fullAddress || state.label, state.message].filter(Boolean).join(' · ');
                host.querySelector('[data-location-message]').textContent = ['현재 접속 위치', state.label, state.message].filter(Boolean).join(' · ');
                button.disabled = ['loading', 'searching'].includes(state.phase);
                button.setAttribute('aria-busy', String(button.disabled));
                host.querySelector('[data-location-action-full]').textContent = state.phase === 'loading' ? '위치 확인 중' : state.phase === 'searching' ? '기관 검색 중' : applied ? '✓ 내 위치 적용됨' : '내 위치로 찾기';
                host.querySelector('[data-location-action-short]').textContent = state.phase === 'loading' ? '확인 중' : state.phase === 'searching' ? '검색 중' : applied ? '✓ 적용됨' : '내 위치';
                const helpLabel = ['denied', 'policy'].includes(state.reason) ? '위치 권한 설정 안내' : state.phase === 'error' ? '현재 위치 확인 오류 안내' : `현재 위치 상세 안내${state.fullAddress ? `: ${state.fullAddress}` : ''}`;
                help.setAttribute('aria-label', helpLabel);
            }
        });
        button.onclick = () => { const state = controller.state(); if (['denied', 'policy', 'insecure', 'unsupported'].includes(state.reason)) showDetails(state); else searchHere(); };
        help.onclick = () => showDetails(controller.state());
        /** SOFTM-LOCATION-TOOLBAR END */
        return controller;
    }
    root.CareListLocation = Object.freeze({ resolveRegion, createController, mount });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-LOCATION END */
