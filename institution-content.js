/** SOFTM-INSTITUTION-CONTENT START 날짜:20261118 : 기관이 직접 확인한 정보와 사진을 공단 공개자료와 구분하고 개인 식별 없는 이용 집계만 전송 */
const DEFAULT_API_BASE = 'https://softm-homecare-pilot.softm.workers.dev';
const INSTITUTION_ID = /^\d{11}$/;
const EVENT_TYPES = new Set(['detail_view', 'phone_click', 'inquiry_click', 'directions_click']);
const MAX_PHOTOS = 10;
const inflightProfiles = new Map();
const loadTokens = new WeakMap();
const boundDetails = new WeakSet();
let memoryVisitorId = '';

function cleanText(value, max = 2000) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanDate(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const input = value.trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input) ? `${input.replace(' ', 'T')}Z` : input;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function safeHttpsUrl(value) {
    try {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'https:' || url.username || url.password) return '';
        return url.href;
    } catch {
        return '';
    }
}

function cleanPhone(value) {
    const label = cleanText(value, 40);
    const href = label.replace(/[^0-9+]/g, '');
    return href.length >= 7 ? { label, href: `tel:${href}` } : null;
}

function cleanEmail(value) {
    const email = cleanText(value, 254);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function optionalCount(value) {
    if (value === null || value === undefined || value === '') return null;
    const count = Number(value);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function operatingHoursText(value) {
    if (typeof value === 'string') return cleanText(value, 200);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const summary = cleanText(value.note || value.summary || value.text, 200);
    if (summary) return summary;
    const labels = { monday: '월', tuesday: '화', wednesday: '수', thursday: '목', friday: '금', saturday: '토', sunday: '일', holiday: '공휴일' };
    return Object.entries(value).flatMap(([key, item]) => {
        const hours = cleanText(item, 80);
        return hours ? [`${labels[key] || cleanText(key, 20)} ${hours}`] : [];
    }).slice(0, 8).join(' · ').slice(0, 500);
}

function publicAssetUrl(value) {
    try {
        const url = new URL(String(value || ''), `${apiBase()}/`);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

export function normalizePublicProfile(payload, expectedInstitutionId = '') {
    const envelope = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const baseProfile = envelope?.profile && typeof envelope.profile === 'object' ? envelope.profile : {};
    const raw = { ...baseProfile, programs: envelope?.programs ?? baseProfile.programs, photos: envelope?.photos ?? baseProfile.photos };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const status = cleanText(envelope?.status || raw.status, 30).toLowerCase();
    if (status && !['published', 'active'].includes(status)) return null;
    const institutionId = String(envelope?.id || raw.institutionId || expectedInstitutionId || '');
    if (!INSTITUTION_ID.test(institutionId) || (expectedInstitutionId && institutionId !== String(expectedInstitutionId))) return null;
    const programs = Array.isArray(raw.programs) ? raw.programs.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const title = cleanText(item.title || item.name, 120);
        if (!title || item.active === false) return [];
        return [{ id: cleanText(item.id, 100), title, schedule: cleanText(item.schedule, 120), description: cleanText(item.description, 500), sortOrder: Number(item.sortOrder) || 0 }];
    }).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 10) : [];
    const photos = Array.isArray(raw.photos) ? raw.photos.flatMap((item, index) => {
        if (!item || typeof item !== 'object' || item.published === false) return [];
        const url = publicAssetUrl(item.url || item.publicUrl);
        if (!url) return [];
        return [{
            id: cleanText(item.id, 100) || `photo-${index + 1}`,
            url,
            altText: cleanText(item.altText, 300) || `${cleanText(raw.displayName || envelope?.name, 120) || '기관'} 등록사진 ${index + 1}`,
            isCover: item.isCover === true,
            sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
        }];
    }).sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder).slice(0, MAX_PHOTOS) : [];
    const confirmedAt = cleanDate(raw.confirmedAt || envelope?.publishedAt || raw.publishedAt);
    const updatedAt = cleanDate(raw.updatedAt || envelope?.updatedAt) || confirmedAt;
    return {
        institutionId,
        institutionName: cleanText(raw.displayName || envelope?.name, 120),
        summary: cleanText(raw.summary, 2000),
        address: cleanText(raw.address, 500),
        hours: operatingHoursText(raw.operatingHours),
        phone: cleanPhone(raw.phone),
        email: cleanEmail(raw.email),
        website: safeHttpsUrl(raw.website),
        transportation: cleanText(raw.transportation, 500),
        capacity: optionalCount(raw.capacity),
        availableSlots: optionalCount(raw.availableSlots),
        programs,
        photos,
        confirmedAt,
        updatedAt,
    };
}

export function formatKoreanDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '확인일 미표시';
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function createEventPayload(event, institutionId) {
    if (!EVENT_TYPES.has(event) || !INSTITUTION_ID.test(String(institutionId || ''))) return null;
    const visitorId = sessionVisitorId();
    return visitorId ? { institutionId: String(institutionId), type: event, visitorId } : null;
}

function sessionVisitorId() {
    const pattern = /^[A-Za-z0-9_-]{20,80}$/;
    const key = 'careInstitutionVisitor';
    try {
        const stored = sessionStorage.getItem(key) || '';
        if (pattern.test(stored)) return stored;
    } catch {}
    if (pattern.test(memoryVisitorId)) return memoryVisitorId;
    if (!globalThis.crypto?.getRandomValues) return '';
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    memoryVisitorId = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    try { sessionStorage.setItem(key, memoryVisitorId); } catch {}
    return memoryVisitorId;
}

function apiBase() {
    const configured = typeof window !== 'undefined' ? window.CARE_INSTITUTION_API_BASE : '';
    return safeHttpsUrl(configured || DEFAULT_API_BASE).replace(/\/$/, '');
}

function node(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function heading(profile) {
    const header = node('header', 'care-institution-head');
    const title = node('div');
    const badge = node('span', 'care-institution-badge', '기관 직접 제공');
    const h3 = node('h3', '', '기관에서 확인한 운영정보');
    title.append(badge, h3);
    const date = profile.confirmedAt || profile.updatedAt;
    const meta = node('p', 'care-institution-date', `${profile.confirmedAt ? '확인' : '수정'} ${formatKoreanDate(date)}`);
    header.append(title, meta);
    return header;
}

function information(profile) {
    const fragment = document.createDocumentFragment();
    if (profile.summary) fragment.append(node('p', 'care-institution-introduction', profile.summary));
    const rows = [
        profile.hours && ['운영시간', profile.hours],
        profile.phone && ['전화', profile.phone.label, profile.phone.href, 'phone_click'],
        profile.email && ['이메일', profile.email, `mailto:${profile.email}`, 'inquiry_click'],
        profile.website && ['홈페이지', '기관 홈페이지·문의 보기', profile.website, 'inquiry_click'],
        profile.address && ['기관 확인 주소', profile.address],
        profile.transportation && ['교통·방문 안내', profile.transportation],
        profile.capacity !== null && ['정원', `${profile.capacity.toLocaleString('ko-KR')}명`],
        profile.availableSlots !== null && ['기관 확인 가능 인원', `${profile.availableSlots.toLocaleString('ko-KR')}명`],
    ].filter(Boolean);
    if (rows.length) {
        const grid = node('dl', 'care-institution-grid');
        for (const [label, value, href, event] of rows) {
            const item = node('div');
            item.append(node('dt', '', label));
            const detail = node('dd');
            if (href) {
                const link = node('a', event === 'inquiry_click' ? 'care-institution-website' : '', value);
                link.href = href;
                if (href.startsWith('https:')) {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                }
                link.dataset.institutionEvent = event || '';
                detail.append(link);
            } else detail.textContent = value;
            item.append(detail);
            grid.append(item);
        }
        fragment.append(grid);
    }
    return fragment;
}

function programs(profile) {
    if (!profile.programs.length) return null;
    const section = node('section', 'care-institution-section');
    section.append(node('h4', '', '프로그램 안내'));
    const listNode = node('div', 'care-institution-programs');
    for (const program of profile.programs) {
        const article = node('article');
        article.append(node('strong', '', program.title));
        if (program.schedule) article.append(node('small', '', program.schedule));
        if (program.description) article.append(node('p', '', program.description));
        listNode.append(article);
    }
    section.append(listNode);
    return section;
}

function photos(profile) {
    if (!profile.photos.length) return null;
    const section = node('section', 'care-institution-section care-institution-photo-section');
    const title = node('div', 'care-institution-section-title');
    title.append(node('h4', '', '기관 등록사진'), node('small', '', `${profile.photos.length}장 · 최대 10장`));
    const gallery = node('div', 'care-institution-photos');
    gallery.dataset.photoGallery = '';
    gallery.dataset.photoInstitution = profile.institutionName || '기관 직접 제공 사진';
    for (const photo of profile.photos) {
        const figure = node('figure');
        const button = node('button');
        button.type = 'button';
        button.dataset.photoViewer = '';
        button.setAttribute('aria-label', `${photo.altText} 크게 보기`);
        const image = node('img');
        image.src = photo.url;
        image.alt = photo.altText;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => figure.classList.add('is-error'), { once: true });
        button.append(image);
        figure.append(button);
        gallery.append(figure);
    }
    section.append(title, gallery);
    return section;
}

export function renderPublicProfile(host, profile) {
    host.replaceChildren();
    const card = node('section', 'care-institution-profile');
    card.setAttribute('aria-label', '기관 직접 제공 정보');
    card.append(heading(profile), information(profile));
    for (const section of [programs(profile), photos(profile)]) if (section) card.append(section);
    card.append(node('p', 'care-institution-source', '이 내용과 사진은 기관이 직접 제공하고 확인했습니다. 국민건강보험공단 공개정보·평가와 별도이며, 최신 이용 가능 여부는 기관에 확인해 주세요.'));
    host.append(card);
    host.hidden = false;
    host.dataset.profileActive = 'true';
}

async function readPublicProfile(institutionId) {
    if (inflightProfiles.has(institutionId)) return inflightProfiles.get(institutionId);
    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
            const response = await fetch(`${apiBase()}/api/public/institutions/${encodeURIComponent(institutionId)}`, {
                mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal,
            });
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`기관 제공 정보 응답 오류 (${response.status})`);
            return normalizePublicProfile(await response.json(), institutionId);
        } finally {
            clearTimeout(timeout);
        }
    })();
    inflightProfiles.set(institutionId, request);
    try {
        return await request;
    } finally {
        if (inflightProfiles.get(institutionId) === request) inflightProfiles.delete(institutionId);
    }
}

function detailViewAllowed(institutionId) {
    try {
        const key = `careInstitutionView:${institutionId}`;
        const previous = Number(sessionStorage.getItem(key));
        if (Number.isFinite(previous) && Date.now() - previous < 30 * 60 * 1000) return false;
        sessionStorage.setItem(key, String(Date.now()));
    } catch {}
    return true;
}

export function trackPublicEvent(event, institutionId) {
    const payload = createEventPayload(event, institutionId);
    if (!payload || (event === 'detail_view' && !detailViewAllowed(institutionId))) return false;
    const body = JSON.stringify(payload);
    const url = `${apiBase()}/api/public/events`;
    void fetch(url, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, cache: 'no-store' }).catch(() => {});
    return true;
}

export async function mountPublicProfile({ host, institution, institutionType = '' } = {}) {
    const institutionId = String(institution?.id || institution?.i || '');
    if (!host || !INSTITUTION_ID.test(institutionId)) return null;
    const token = Symbol(institutionId);
    loadTokens.set(host, token);
    host.hidden = true;
    host.removeAttribute('data-profile-active');
    host.replaceChildren();
    try {
        const profile = await readPublicProfile(institutionId);
        if (loadTokens.get(host) !== token || !host.isConnected) return null;
        if (!profile) return null;
        if (!profile.institutionName) profile.institutionName = cleanText(institution.name || institution.n, 120);
        renderPublicProfile(host, profile);
        trackPublicEvent('detail_view', institutionId);
        return profile;
    } catch (error) {
        if (loadTokens.get(host) === token) {
            host.hidden = true;
            host.replaceChildren();
        }
        console.warn('[기관 직접 제공 정보] 불러오지 못했습니다.', error);
        return null;
    }
}

export function bindDetailTracking(host, institutionId, institutionType = '') {
    if (!host) return;
    host.dataset.institutionTrackingId = String(institutionId || '');
    host.dataset.institutionTrackingType = cleanText(institutionType, 50);
    if (boundDetails.has(host)) return;
    boundDetails.add(host);
    host.addEventListener('click', event => {
        const id = host.dataset.institutionTrackingId;
        if (!INSTITUTION_ID.test(id) || !host.querySelector('[data-institution-content][data-profile-active="true"]')) return;
        const target = event.target.closest?.('a,button');
        if (!target) return;
        let type = target.dataset.institutionEvent || '';
        if (!type && target.matches('a[href^="tel:"]')) type = 'phone_click';
        if (!type && target.matches('.care-popup-navigation,.detail-links .naver,.detail-links .kakao')) type = 'directions_click';
        if (!EVENT_TYPES.has(type) || type === 'detail_view') return;
        trackPublicEvent(type, id);
    }, true);
}

if (typeof window !== 'undefined') {
    window.InstitutionContent = Object.freeze({
        mount: mountPublicProfile,
        bindDetailActions: bindDetailTracking,
        track: trackPublicEvent,
        normalizePublicProfile,
    });
    window.dispatchEvent(new CustomEvent('care:institution-content-ready'));
}
/** SOFTM-INSTITUTION-CONTENT END */
