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
            update({ phase: 'loading', label: '현재 위치 확인 중…', message: '', reason: '', fullAddress: '' }); // SOFTM-LIST-LOCATION-COMPACT 날짜:20260930 : 재확인 중 지난 주소를 현재 접속 위치의 상세주소로 표시하지 않음
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
                update({ phase: 'ready', label, fullAddress: address.fullAddress || address.address || label, message: '현재 위치의 시·군·구에서 검색합니다.' }); // SOFTM-LIST-LOCATION-COMPACT 날짜:20260930 : 한 줄 주소는 유지하면서 전체 주소를 별도 안내에서 확인할 수 있도록 보관
                if (!search) return { point, address };
                if (signature !== options.signature()) {
                    update({ message: '검색조건이 바뀌어 위치 검색을 취소했습니다. 다시 눌러 주세요.' });
                    return { cancelled: true };
                }
                update({ phase: 'searching', message: '현재 위치의 기관을 찾고 있습니다…' });
                const outcome = await options.apply(address);
                if (!current()) return { cancelled: true };
                update({ phase: 'ready', message: outcome?.cancelled ? '검색조건이 바뀌어 위치 검색을 취소했습니다.' : `${outcome.scope} · ${outcome.count.toLocaleString('ko-KR')}곳 검색 완료` });
                return outcome;
            } catch (error) {
                if (!current()) return { cancelled: true };
                const detail = point ? { title: state.label, message: error.message, reason: '' } : options.errorInfo(error);
                update({ phase: 'error', label: detail.title, message: detail.message, reason: detail.reason });
                return { error };
            }
        }
        function sync() {
            if (!options.enabled()) {
                revision++;
                if (['loading', 'searching'].includes(state.phase)) { attempted = false; update({ phase: 'idle', label: '위치 확인 전', message: '' }); }
            } else if (!attempted) void locate();
        }
        return { locate, sync, state: () => ({ ...state }) };
    }

    function mount(options) {
        /** SOFTM-LIST-LOCATION-COMPACT START 날짜:20260930 : 접속 위치가 기관 목록 높이를 차지하지 않도록 검색 위 한 줄과 별도 안내로 분리 */
        const host = root.document.createElement('section');
        host.id = 'careListLocation'; host.setAttribute('aria-label', '현재 접속 위치');
        host.innerHTML = '<div class="care-list-location-copy"><strong>현재 위치</strong><span data-location-label title="위치 확인 전">위치 확인 전</span></div><button type="button" data-list-location-help aria-label="현재 위치 상세 안내" title="현재 위치 상세 안내" aria-haspopup="dialog"><span aria-hidden="true">ⓘ</span></button><button type="button" data-list-locate aria-label="현재 위치에서 찾기" title="현재 위치에서 찾기"><span data-location-action-full>현재 위치에서 찾기</span><span data-location-action-short aria-hidden="true">내 주변</span></button><span class="care-list-location-announcement" data-location-message role="status" aria-live="polite" aria-atomic="true"></span>';
        root.document.querySelector('.filters')?.before(host);
        const button = host.querySelector('[data-list-locate]'), help = host.querySelector('[data-list-location-help]');
        let detailDialog;
        function showDetails(state) {
            if (state.phase === 'error' && state.reason) {
                root.CareLocation.showNotice({ reason: state.reason }, () => button.click());
                return;
            }
            if (!detailDialog) {
                detailDialog = root.document.createElement('dialog');
                detailDialog.className = 'care-list-location-dialog';
                detailDialog.setAttribute('aria-labelledby', 'careListLocationDetailTitle');
                detailDialog.innerHTML = '<h2 id="careListLocationDetailTitle">현재 접속 위치</h2><p data-location-detail-address></p><p data-location-detail-message></p><div><button type="button" data-location-detail-retry>현재 위치 다시 확인</button><button type="button" data-location-detail-close>닫기</button></div>';
                root.document.body.append(detailDialog);
                detailDialog.querySelector('[data-location-detail-close]').onclick = () => detailDialog.close();
                detailDialog.querySelector('[data-location-detail-retry]').onclick = () => { detailDialog.close(); button.click(); };
                detailDialog.addEventListener('close', () => help.focus({ preventScroll: true }));
            }
            detailDialog.querySelector('h2').textContent = state.phase === 'error' ? '현재 위치 안내' : '현재 접속 위치';
            detailDialog.querySelector('[data-location-detail-address]').textContent = state.fullAddress || state.label;
            detailDialog.querySelector('[data-location-detail-message]').textContent = state.message || '현재 위치의 시·군·구에서 기관을 찾을 수 있습니다.';
            detailDialog.querySelector('[data-location-detail-retry]').hidden = state.phase !== 'error';
            if (!detailDialog.open) detailDialog.showModal();
        }
        const controller = createController({
            ...options,
            locate: config => root.CareLocation.request(config), errorInfo: error => root.CareLocation.info(error),
            render(state) {
                host.dataset.phase = state.phase;
                const label = host.querySelector('[data-location-label]');
                const shortError = ['denied', 'policy'].includes(state.reason) ? '위치 권한 확인' : state.reason === 'timeout' ? '위치 확인 지연' : state.reason ? '위치 확인 불가' : state.fullAddress ? '위치 검색 안내' : '지역명 확인 필요';
                label.textContent = state.phase === 'error' ? shortError : state.label;
                label.title = [state.fullAddress || state.label, state.message].filter(Boolean).join(' · ');
                host.querySelector('[data-location-message]').textContent = ['현재 접속 위치', state.label, state.message].filter(Boolean).join(' · ');
                button.disabled = ['loading', 'searching'].includes(state.phase);
                button.setAttribute('aria-busy', String(button.disabled));
                host.querySelector('[data-location-action-full]').textContent = state.phase === 'loading' ? '위치 확인 중…' : state.phase === 'searching' ? '기관 검색 중…' : '현재 위치에서 찾기';
                host.querySelector('[data-location-action-short]').textContent = state.phase === 'loading' ? '확인 중…' : state.phase === 'searching' ? '검색 중…' : '내 주변';
                const helpLabel = state.reason === 'denied' ? '위치 권한 설정 안내' : state.phase === 'error' ? '현재 위치 확인 오류 안내' : '현재 위치 상세 안내';
                help.setAttribute('aria-label', helpLabel); help.title = helpLabel;
            }
        });
        button.onclick = () => { root.CareLocation.hideNotice(); void controller.locate(true); };
        help.onclick = () => showDetails(controller.state());
        /** SOFTM-LIST-LOCATION-COMPACT END */
        return controller;
    }
    root.CareListLocation = Object.freeze({ resolveRegion, createController, mount });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-LOCATION END */
