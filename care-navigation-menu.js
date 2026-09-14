/** SOFTM-NAV-MENU START 날짜:20260914 : 보조 탐색 도구를 검색 결과 밖으로 모으고 기존 기능의 클릭 처리를 재사용 */
(function () {
    'use strict';
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'care-menu-trigger';
    trigger.setAttribute('aria-label', '전체 메뉴 열기'); trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'careNavigationMenu'); trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    const menu = document.createElement('dialog'); menu.id = 'careNavigationMenu'; menu.className = 'care-navigation-menu';
    menu.setAttribute('aria-labelledby', 'careNavigationTitle');
    menu.innerHTML = '<header><h2 id="careNavigationTitle">돌봄한눈 메뉴</h2><button type="button" aria-label="전체 메뉴 닫기">×</button></header><nav aria-label="보조 탐색"><h3>더 살펴보기</h3></nav>';
    const entries = [
        ['맞춤조건', '내 상황에 맞는 기관 조건을 선택해요', '.care-match-start', '✓'],
        ['사진 찾기', '현재 지도에 표시된 기관의 사진을 봐요', '.care-photo-map-entry', '▧'],
        ['주변분석', '보고 있는 지역의 돌봄 환경을 살펴봐요', '.care-analysis-entry', '◎'],
        ['이용 안내', '현재 돌봄 유형의 이용 방법을 확인해요', '.care-context-links .care-context-guide', '?'],
        ['서비스 소개', '돌봄한눈과 자료 출처를 알아봐요', '.care-context-links a[href="about.html"]', 'ⓘ']
    ];
    function close(restore = true) { menu.close(); trigger.setAttribute('aria-expanded', 'false'); if (restore) trigger.focus({ preventScroll: true }); }
    for (const [label, description, selector, icon] of entries) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.menuTarget = selector;
        button.innerHTML = `<span class="care-menu-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong><small>${description}</small></span><span aria-hidden="true">›</span>`;
        button.onclick = () => { const target = document.querySelector(selector); if (!target) return; close(false); target.click(); const message = document.querySelector('.care-photo-map-status')?.textContent; if (selector === '.care-photo-map-entry' && message) { menu.querySelector('[role="status"]').textContent = message; menu.showModal(); trigger.setAttribute('aria-expanded', 'true'); } };
        menu.querySelector('nav').append(button);
    }
    trigger.onclick = () => {
        for (const button of menu.querySelectorAll('[data-menu-target]')) button.disabled = !document.querySelector(button.dataset.menuTarget);
        menu.showModal(); trigger.setAttribute('aria-expanded', 'true');
    };
    menu.querySelector('header button').onclick = () => close();
    menu.addEventListener('cancel', event => { event.preventDefault(); close(); });
    menu.addEventListener('click', event => { if (event.target === menu) { const r = menu.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
    new MutationObserver(() => { if (menu.open) for (const button of menu.querySelectorAll('[data-menu-target]')) button.disabled = !document.querySelector(button.dataset.menuTarget); }).observe(document.body, { childList: true, subtree: true });
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    const status = document.createElement('p'); status.setAttribute('role', 'status'); menu.append(status);
    document.body.append(trigger, menu); document.body.classList.add('care-has-navigation');
})();
/** SOFTM-NAV-MENU END */
