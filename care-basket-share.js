/** SOFTM-BASKET-SHARE START 날짜:20260911 : 기관 유형과 방문 순서만 공유하고 받는 사람의 기존 목록은 동의 없이 덮어쓰지 않음 */
(function (root) {
    'use strict';
    const types = new Set(['facility', 'daycare', 'home-care', 'home-nursing', 'home-bath', 'short-stay', 'welfare-equipment', 'dementia', 'nursing-hospital']);
    const validId = id => typeof id === 'string' && /^[A-Za-z0-9_=-]{1,160}$/.test(id);
    /** SOFTM-BASKET-SHARE-QUERY START 날짜:20260911 : 공유 앱이 URL 조각을 버려도 담은 기관이 남도록 쿼리를 우선 사용하고 기존 해시 링크도 읽음 */
    const basketValue = url => url.searchParams.get('basket') ?? new URLSearchParams(url.hash.slice(1)).get('basket');
    const hasLink = value => basketValue(new URL(value)) !== null;
    function createUrl(value, type, ids) {
        if (!types.has(type) || !ids.length || !ids.every(validId)) throw new Error('공유할 기관 목록을 확인해 주세요.');
        const url = new URL('nationwide-care-services-map.html', value);
        url.search = ''; url.hash = '';
        url.searchParams.set('type', type);
        url.searchParams.set('basket', `v1.${[...new Set(ids)].join(',')}`);
        if (url.href.length > 24000) throw new Error('공유할 기관이 너무 많습니다. 목록을 나누어 공유해 주세요.');
        return url.href;
    }
    function readLink(value, type, valid) {
        const url = new URL(value), raw = basketValue(url);
        if (raw === null) return null;
        if (!types.has(type) || (url.searchParams.get('type') || 'daycare') !== type || !raw.startsWith('v1.') || raw.length > 24000) return { error: '올바르지 않은 담은 기관 공유 링크입니다.' };
        const ids = raw.slice(3).split(',');
        if (!ids.length || !ids.every(validId)) return { error: '공유 링크의 기관 목록을 읽을 수 없습니다.' };
        const unique = [...new Set(ids)], found = unique.filter(id => valid.has(id));
        return { ids: found, missing: unique.length - found.length, total: unique.length };
    }
    async function copyLink(value, navigator = root.navigator) {
        try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
    }
    async function shareLink(data, navigator = root.navigator) {
        try { await navigator.share(data); return 'shared'; } catch (error) { return error?.name === 'AbortError' ? 'cancelled' : 'failed'; }
    }
    function mount({ host, type, ids, rows, replace, open }) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'icon-btn care-basket-share-button'; button.dataset.basketShare = ''; button.setAttribute('aria-label', '담은 기관 공유'); button.title = '담은 기관 공유';
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2"></path></svg>';
        host.querySelector('.care-saved-heading').append(button);
        let dialog;
        function show(title, description) {
            dialog?.remove();
            const previous = document.activeElement;
            dialog = document.createElement('dialog'); dialog.className = 'care-basket-share-dialog';
            dialog.setAttribute('aria-labelledby', 'careBasketShareTitle');
            dialog.innerHTML = '<form method="dialog"><button class="care-share-close" aria-label="공유 창 닫기">×</button></form><h2 id="careBasketShareTitle"></h2><p class="care-share-description"></p><div class="care-share-content"></div><p class="care-share-status" role="status" aria-live="polite"></p><div class="care-share-actions"></div>';
            dialog.querySelector('h2').textContent = title;
            dialog.querySelector('.care-share-description').textContent = description;
            const current = dialog;
            dialog.addEventListener('close', () => { previous?.focus({ preventScroll: true }); current.remove(); }, { once: true });
            dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
            document.body.append(dialog); dialog.showModal();
            return dialog;
        }
        function action(panel, label, handler) {
            const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.onclick = handler;
            panel.querySelector('.care-share-actions').append(node); return node;
        }
        function list(panel, incoming) {
            const names = new Map(rows().map(row => [String(row.i), row]));
            const ol = document.createElement('ol');
            incoming.forEach(id => { const row = names.get(id), li = document.createElement('li'); li.textContent = `${row?.n || id}${row?.a ? ` · ${row.a}` : ''}`; ol.append(li); });
            panel.querySelector('.care-share-content').append(ol);
        }
        button.onclick = async () => {
            const selected = ids(), status = host.querySelector('.care-order-status');
            if (!selected.length) { status.textContent = '먼저 공유할 기관을 담아 주세요.'; return; }
            let url;
            try { url = createUrl(root.location.href, type, selected); } catch (error) { status.textContent = error.message; return; }
            if (root.navigator.share) {
                const result = await shareLink({ title: `돌봄한눈 · 담은 기관 ${selected.length}곳`, text: '담은 기관과 방문 순서를 확인해 보세요.', url });
                if (result === 'cancelled') return;
                if (result === 'shared') { status.textContent = '공유를 완료했습니다.'; return; }
            }
            if (await copyLink(url)) { status.textContent = '담은 기관 공유 링크를 복사했습니다.'; return; }
            const panel = show('공유 링크 복사', '자동 복사가 제한되어 있습니다. 아래 링크를 길게 누르거나 Ctrl/Cmd+C로 복사해 주세요.');
            const input = document.createElement('input'); input.type = 'text'; input.readOnly = true; input.value = url; input.setAttribute('aria-label', '담은 기관 공유 링크');
            input.onclick = () => input.select(); panel.querySelector('.care-share-content').append(input); input.focus(); input.select();
        };
        // SOFTM-BASKET-SHARE 날짜:20260911 : 초기 검색 렌더 뒤 공유 목록으로 전환해 부팅 조회가 담은 기관을 덮지 않도록 지연
        function receive() {
            const incoming = readLink(root.location.href, type, new Set(rows().map(row => String(row.i))));
            if (!incoming) return;
            open();
            const consume = () => {
                const url = new URL(root.location.href), hash = new URLSearchParams(url.hash.slice(1));
                url.searchParams.delete('basket'); hash.delete('basket'); url.hash = hash.toString();
                root.history.replaceState(root.history.state, '', url.href);
            };
            const message = incoming.error || (!incoming.ids.length ? '공유된 기관을 현재 자료에서 찾을 수 없습니다. 기존 담은 기관은 유지됩니다.' : '');
            if (message) { const panel = show('담은 기관 공유', message); panel.addEventListener('close', consume, { once: true }); return; }
            const note = incoming.missing ? ` 현재 자료에서 찾을 수 없는 ${incoming.missing}곳은 제외됐습니다.` : '';
            const apply = () => { replace(incoming.ids, `공유받은 기관 ${incoming.ids.length}곳을 방문 순서대로 불러왔습니다.${note}`); consume(); };
            if (!ids().length || ids().join(',') === incoming.ids.join(',')) { apply(); return; }
            const panel = show(`공유받은 기관 ${incoming.ids.length}곳`, `현재 담은 기관 ${ids().length}곳을 이 목록으로 바꿀까요?${note}`);
            list(panel, incoming.ids);
            action(panel, '기존 목록 유지', () => panel.close());
            action(panel, '공유 목록으로 바꾸기', () => { apply(); panel.close(); });
            panel.addEventListener('close', consume, { once: true });
        }
        root.setTimeout(receive, 0);
        root.addEventListener('hashchange', receive);
    }
    /** SOFTM-BASKET-SHARE-QUERY END */
    root.CareBasketShare = Object.freeze({ createUrl, readLink, hasLink, copyLink, shareLink, mount });
})(globalThis);
/** SOFTM-BASKET-SHARE END */
