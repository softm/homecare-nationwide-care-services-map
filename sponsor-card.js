/** SOFTM-SPONSOR START 날짜:20260917 : 승인된 단일 광고를 계약 기간 안에서만 표시하고 안전한 링크로 연결 */
(function (root) {
    'use strict';
    function activeCampaign(campaign, now = Date.now()) {
        if (!campaign || campaign.approved !== true) return null;
        const start = Date.parse(campaign.startsAt), end = Date.parse(campaign.endsAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || now < start || now >= end) return null;
        if (![campaign.id, campaign.name, campaign.title, campaign.description, campaign.url].every(value => typeof value === 'string' && value.trim())) return null;
        try {
            const url = new URL(campaign.url);
            if (url.protocol !== 'https:' || url.username || url.password) return null;
            return { ...campaign, url: url.href };
        } catch { return null; }
    }
    root.CareSponsor = { activeCampaign };
    if (!root.document) return;
    let lastContent;
    function render() {
        const campaign = activeCampaign(root.CARE_SPONSOR_CONFIG?.campaign);
        const content = JSON.stringify(campaign);
        if (lastContent === content) return;
        lastContent = content;
        document.querySelectorAll('[data-sponsor-slot]').forEach(slot => {
            slot.replaceChildren();
            slot.hidden = !campaign;
            if (!campaign) return;
            const label = document.createElement('p'); label.className = 'sponsor-label'; label.textContent = `광고 · ${campaign.name}`;
            const title = document.createElement('h2'); title.textContent = campaign.title;
            const copy = document.createElement('p'); copy.textContent = campaign.description;
            const link = document.createElement('a'); link.href = campaign.url; link.rel = 'sponsored noopener noreferrer'; link.target = '_blank'; link.textContent = '광고주 서비스 알아보기';
            const note = document.createElement('small'); note.textContent = '유료 광고입니다. 기관 검색순위·공단평가와 무관합니다.';
            slot.append(label, title, copy, link, note);
        });
    }
    render();
    // 열린 페이지에서도 광고 종료를 반영하고 백그라운드 복귀 시 즉시 재검사합니다.
    setInterval(render, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-SPONSOR END */
