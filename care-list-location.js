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
            update({ phase: 'loading', label: '현재 위치 확인 중…', message: '', reason: '' });
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
                update({ phase: 'ready', label, message: '현재 위치의 시·군·구에서 검색합니다.' });
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
        const host = root.document.createElement('section');
        host.id = 'careListLocation'; host.setAttribute('aria-label', '현재 접속 위치');
        host.innerHTML = '<div class="care-list-location-copy" role="status" aria-live="polite"><strong>현재 접속 위치</strong><span data-location-label>위치 확인 전</span><small data-location-message>현재 위치의 시·군·구에서 검색합니다.</small></div><button type="button" data-list-locate>현재 위치에서 찾기</button><button type="button" data-list-location-help hidden>위치 권한 설정 안내</button>';
        root.document.querySelector('.filters')?.prepend(host);
        const button = host.querySelector('[data-list-locate]'), help = host.querySelector('[data-list-location-help]');
        const controller = createController({
            ...options,
            locate: config => root.CareLocation.request(config), errorInfo: error => root.CareLocation.info(error),
            render(state) {
                host.dataset.phase = state.phase;
                host.querySelector('[data-location-label]').textContent = state.label;
                host.querySelector('[data-location-message]').textContent = state.message || '현재 위치의 시·군·구에서 검색합니다.';
                button.disabled = ['loading', 'searching'].includes(state.phase);
                button.setAttribute('aria-busy', String(button.disabled));
                button.textContent = state.phase === 'loading' ? '위치 확인 중…' : state.phase === 'searching' ? '기관 검색 중…' : '현재 위치에서 찾기';
                help.hidden = state.reason !== 'denied';
            }
        });
        button.onclick = () => { root.CareLocation.hideNotice(); void controller.locate(true); };
        help.onclick = () => root.CareLocation.showNotice({ reason: 'denied' }, () => button.click());
        return controller;
    }
    root.CareListLocation = Object.freeze({ resolveRegion, createController, mount });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-LOCATION END */
