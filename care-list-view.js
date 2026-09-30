/** SOFTM-LIST-VIEW START 날짜:20260930 : 보기 전환이 검색·담기·사진·광고를 다시 만들지 않도록 표현 상태만 변경 */
(function (root) {
    'use strict';
    const storageKey = 'careListView:v1';
    const views = ['cards', 'rows', 'compact'];
    const resolveView = value => views.includes(value) ? value : 'cards';
    let view = 'cards', toolbar = null;
    try { view = resolveView(root.sessionStorage?.getItem(storageKey)); } catch {}

    function sync() {
        if (!toolbar) return;
        root.document.body.dataset.careListView = view;
        toolbar.hidden = !root.CareListMode?.isList();
        toolbar.querySelectorAll('[data-list-view]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.listView === view));
        });
    }

    function setView(value) {
        if (!views.includes(value) || value === view) return;
        const position = root.CareListSticky?.capture(); // SOFTM-LIST-STICKY 날짜:20260930 : 보기 밀도를 바꿔도 실제 화면에 보이던 기관을 유지
        const list = root.document?.getElementById('list');
        const top = list?.getBoundingClientRect().top ?? 0;
        const anchor = [...(list?.querySelectorAll('.row') || [])].find(row => row.getBoundingClientRect().bottom > top);
        const offset = anchor ? anchor.getBoundingClientRect().top - top : 0;
        view = value;
        try { root.sessionStorage?.setItem(storageKey, view); } catch {}
        sync();
        if (position) root.CareListSticky.restore(position); // SOFTM-LIST-STICKY 날짜:20260930 : 단일 본문 스크롤과 고정 도구 아래 기준선으로 복원
        else if (anchor?.isConnected && root.CareListMode?.isList()) {
            list.scrollTop += anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - offset;
        }
    }

    function mount() {
        if (toolbar) { sync(); return; }
        const head = root.document?.querySelector('.results .list-head');
        if (!head) return;
        toolbar = root.document.createElement('div');
        toolbar.id = 'careListViewToolbar';
        toolbar.setAttribute('role', 'group');
        toolbar.setAttribute('aria-label', '목록 보기 방식');
        const icons = ['<rect x="3" y="3" width="6" height="6"/><rect x="13" y="3" width="6" height="6"/><rect x="3" y="13" width="6" height="6"/><rect x="13" y="13" width="6" height="6"/>', '<rect x="3" y="4" width="5" height="5"/><path d="M11 5h9M11 8h6"/><rect x="3" y="13" width="5" height="5"/><path d="M11 14h9M11 17h6"/>', '<path d="M3 5h17M3 11h17M3 17h17"/>'];
        toolbar.innerHTML = views.map((value, index) => `<button type="button" data-list-view="${value}" aria-controls="list" aria-pressed="${value === view}"><svg aria-hidden="true" viewBox="0 0 24 24">${icons[index]}</svg><span>${['카드형', '목록형', '간단형'][index]}</span></button>`).join('');
        toolbar.addEventListener('click', event => {
            const button = event.target.closest('[data-list-view]');
            if (button) setView(button.dataset.listView);
        });
        head.append(toolbar);
        const summary = root.document.getElementById('careListSummary');
        if (summary && root.matchMedia?.('(max-width:1000px), (max-height:850px)').matches) summary.open = false;
        sync();
    }

    root.CareListView = Object.freeze({ resolveView, getView: () => view, setView, mount, sync });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-VIEW END */
