/** SOFTM-INSTITUTION-PORTAL START 날짜:20261118 : 공통 계정의 단기 PKCE 세션으로 승인된 기관만 운영정보·사진·집계를 관리 */
export const INSTITUTION_API_BASE = 'https://softm-homecare-pilot.softm.workers.dev';
export const ACCOUNT_API_BASE = 'https://softm-hannun-account.softm.workers.dev';
export const PILOT_AGREEMENT_VERSION = 'homecare-pilot-20261118-v1';
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SITE_ID = 'homecare';
const PROOF = /^[A-Za-z0-9_-]{43}$/;
const INSTITUTION_ID = /^\d{11}$/;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function text(value, max = 2000) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function email(value) {
    const normalized = text(value, 254);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function phone(value) {
    const normalized = text(value, 40);
    return normalized.replace(/\D/g, '').length >= 8 ? normalized : '';
}

function httpsUrl(value) {
    if (!text(value)) return '';
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

export function validateClaim(value) {
    const claim = {
        institutionId: String(value?.institutionId || '').trim(),
        institutionName: text(value?.institutionName, 120),
        contactName: text(value?.contactName, 80),
        contactEmail: email(value?.contactEmail),
        contactPhone: phone(value?.contactPhone),
        note: text(value?.note, 500),
        truthful: value?.truthful === true,
    };
    if (!INSTITUTION_ID.test(claim.institutionId)) throw new Error('기관기호 11자리를 확인해 주세요.');
    if (!claim.institutionName || !claim.contactName) throw new Error('기관명과 담당자명을 입력해 주세요.');
    if (!claim.contactEmail) throw new Error('업무 이메일 주소를 확인해 주세요.');
    if (!claim.contactPhone) throw new Error('업무 연락처를 확인해 주세요.');
    if (!claim.truthful) throw new Error('기관 담당자 확인 동의가 필요합니다.');
    return claim;
}

export function validateProfile(value) {
    const websiteInput = text(value?.website, 500);
    const optionalCount = (input, label) => {
        if (input === '' || input === null || input === undefined) return null;
        const count = Number(input);
        if (!Number.isSafeInteger(count) || count < 0 || count > 100000) throw new Error(`${label}은 0 이상의 숫자로 입력해 주세요.`);
        return count;
    };
    const profile = {
        displayName: text(value?.displayName, 120),
        summary: text(value?.summary, 2000),
        phone: text(value?.phone, 40),
        email: text(value?.email, 254),
        website: websiteInput ? httpsUrl(websiteInput) : '',
        address: text(value?.address, 300),
        operatingHours: { note: text(value?.operatingHours?.note ?? value?.operatingHours, 200) },
        transportation: text(value?.transportation, 500),
        capacity: optionalCount(value?.capacity, '정원'),
        availableSlots: optionalCount(value?.availableSlots, '기관 확인 가능 인원'),
        programs: Array.isArray(value?.programs) ? value.programs.flatMap(item => {
            const title = text(item?.title || item?.name, 120);
            if (!title) return [];
            return [{ id: text(item?.id, 100), title, description: text(item?.description, 500), schedule: text(item?.schedule, 120), sortOrder: Number(item?.sortOrder) || 0, active: item?.active !== false }];
        }).slice(0, 10) : [],
    };
    if (websiteInput && !profile.website) throw new Error('홈페이지는 로그인 정보가 없는 HTTPS 주소로 입력해 주세요.');
    if (profile.email && !email(profile.email)) throw new Error('업무 이메일 주소를 확인해 주세요.');
    if (profile.phone && !phone(profile.phone)) throw new Error('대표 전화번호를 확인해 주세요.');
    if (profile.capacity !== null && profile.availableSlots !== null && profile.availableSlots > profile.capacity) throw new Error('기관 확인 가능 인원은 정원을 초과할 수 없습니다.');
    if (!profile.displayName || (!profile.summary && !profile.operatingHours.note && !profile.phone && !profile.programs.length))
        throw new Error('공개할 운영정보를 한 항목 이상 입력해 주세요.');
    return profile;
}

export function validatePhotoFiles(files, currentCount = 0) {
    const selected = [...(files || [])];
    if (!selected.length) throw new Error('올릴 사진을 선택해 주세요.');
    if (currentCount + selected.length > MAX_PHOTOS) throw new Error(`사진은 최대 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`);
    for (const file of selected) {
        if (!ALLOWED_PHOTO_TYPES.has(file.type)) throw new Error('JPG·PNG·WebP 사진만 등록할 수 있습니다.');
        if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) throw new Error('사진은 파일당 5MB 이하여야 합니다.');
    }
    return selected;
}

export function validateAgreement(value) {
    if (value?.freePilot !== true || value?.noPayment !== true || value?.contentAuthority !== true)
        throw new Error('무료 시범운영·결제 약정 없음·콘텐츠 공개 권한을 모두 확인해 주세요.');
    return { version: PILOT_AGREEMENT_VERSION, freePilot: true, noPayment: true, contentAuthority: true, accepted: true };
}

export function hasCurrentPilotAgreement(value) {
    const agreement = value?.pilotAgreement || value;
    return agreement?.status === 'accepted'
        && agreement?.version === PILOT_AGREEMENT_VERSION
        && agreement?.confirmations?.freePilot === true
        && agreement?.confirmations?.noPayment === true
        && agreement?.confirmations?.contentAuthority === true;
}

export function institutionAccess(role, status) {
    const canManage = ['owner', 'editor'].includes(text(role, 30).toLowerCase());
    return { canManage, canEdit: canManage && text(status, 30).toLowerCase() !== 'suspended' };
}

// SOFTM-INSTITUTION-REVISION 날짜:20261118 : 기관 콘텐츠 변경은 서버 revision과 정확히 일치할 때만 허용
export function contentRevision(value) {
    const revision = value && typeof value === 'object' ? value.contentRevision : value;
    return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1 ? revision : null;
}

export function contentIfMatch(value) {
    const revision = contentRevision(value);
    if (revision === null) throw new Error('기관 정보 변경 기준을 확인할 수 없습니다. 서버 최신 내용을 새로 불러와 주세요.');
    return `"${revision}"`;
}

export function isContentConflict(error) {
    return error?.status === 409 && error?.code === 'content_conflict';
}

export function photoUploadFailurePlan(uploaded, error) {
    const completed = Number.isSafeInteger(uploaded) && uploaded > 0;
    const conflict = isContentConflict(error);
    return { conflict, completed, refreshPhotoManager: completed && !conflict };
}

function base64url(bytes) {
    let chars = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) chars += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(chars).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
    return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function randomProof() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
}

export function createAccountClient({ accountBase = ACCOUNT_API_BASE, institutionBase = INSTITUTION_API_BASE, siteId = SITE_ID } = {}) {
    const account = new URL(accountBase);
    const institution = new URL(institutionBase);
    if (account.protocol !== 'https:' || institution.protocol !== 'https:' || account.pathname !== '/' || institution.pathname !== '/' || account.search || institution.search || account.hash || institution.hash) throw new Error('잘못된 계정 또는 기관 API 설정입니다.');
    const storageKey = `softm-cloudflare:${siteId}:${account.hostname}`;
    let auth = null;
    try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        if (saved && PROOF.test(saved.token) && typeof saved.uid === 'string' && saved.uid.length > 0 && saved.uid.length <= 128 && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) auth = saved;
        else sessionStorage.removeItem(storageKey);
    } catch {
        try { sessionStorage.removeItem(storageKey); } catch {}
    }
    function currentUser() {
        return auth && auth.expiresAt > Date.now() ? { uid: auth.uid, displayName: auth.displayName || '', photoURL: auth.photoURL || '' } : null;
    }
    function clearSession() {
        auth = null;
        try { sessionStorage.removeItem(storageKey); } catch {}
    }
    function requireAuth() {
        if (!currentUser()) throw new Error('로그인을 다시 해 주세요.');
        return auth.token;
    }
    async function request(path, { method = 'GET', body, headers = {} } = {}) {
        let url;
        try { url = new URL(path, institution); }
        catch { throw new Error('잘못된 기관 API 경로입니다.'); }
        if (url.origin !== institution.origin || !url.pathname.startsWith('/api/institutions/') || url.username || url.password || url.hash) throw new Error('잘못된 기관 API 경로입니다.');
        const requestHeaders = { ...headers, Authorization: `Bearer ${requireAuth()}` };
        let requestBody = body;
        if (body !== undefined && !(body instanceof FormData)) {
            requestHeaders['Content-Type'] = 'application/json';
            requestBody = JSON.stringify(body);
        }
        const response = await fetch(url, { method, mode: 'cors', credentials: 'omit', headers: requestHeaders, body: requestBody, cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401) {
                clearSession();
            }
            const error = new Error(data?.error?.message || data?.message || `요청을 처리하지 못했습니다. (${response.status})`);
            error.status = response.status;
            error.code = data?.error?.code || data?.code || '';
            throw error;
        }
        return data?.data ?? data;
    }
    async function fetchBlob(path) {
        const rawPath = typeof path === 'string' ? path.trim() : '';
        let url;
        try { url = new URL(rawPath || '/', institution); }
        catch { throw new Error('잘못된 사진 미리보기 경로입니다.'); }
        if (!/^\/api\/institutions\/[^/]+\/photos\/[^/]+\/content$/.test(url.pathname) || url.origin !== institution.origin || url.username || url.password || url.search || url.hash) throw new Error('잘못된 사진 미리보기 경로입니다.');
        const response = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', headers: { Authorization: `Bearer ${requireAuth()}`, Accept: 'image/jpeg,image/png,image/webp' }, cache: 'no-store' });
        if (!response.ok) {
            if (response.status === 401) clearSession();
            const data = await response.json().catch(() => ({}));
            const error = new Error(data?.error?.message || data?.message || `사진을 불러오지 못했습니다. (${response.status})`);
            error.status = response.status;
            error.code = data?.error?.code || data?.code || '';
            throw error;
        }
        const contentType = (response.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
        if (!ALLOWED_PHOTO_TYPES.has(contentType)) throw new Error('사진 미리보기 형식을 확인할 수 없습니다.');
        const declaredSize = Number(response.headers.get('Content-Length'));
        if (Number.isFinite(declaredSize) && declaredSize > MAX_PHOTO_BYTES) throw new Error('사진 미리보기 크기가 허용 범위를 초과했습니다.');
        const blob = await response.blob();
        if (!blob.size || blob.size > MAX_PHOTO_BYTES) throw new Error('사진 미리보기 크기가 허용 범위를 초과했습니다.');
        return blob;
    }
    async function login() {
        const popup = window.open('about:blank', '_blank', 'popup,width=500,height=780');
        if (!popup) throw new Error('로그인 팝업을 허용해 주세요.');
        const verifier = randomProof(), challenge = await sha256(verifier), requestId = randomProof();
        if (![verifier, challenge, requestId].every(value => PROOF.test(value))) throw new Error('보안 난수를 만들지 못했습니다.');
        const url = new URL('/connect', account);
        url.searchParams.set('site', siteId);
        url.searchParams.set('origin', location.origin);
        url.searchParams.set('challenge', challenge);
        url.searchParams.set('request', requestId);
        return new Promise((resolve, reject) => {
            let timer, watch, settled = false;
            const cleanup = () => { window.removeEventListener('message', receive); clearTimeout(timer); clearInterval(watch); };
            const stop = error => { if (settled) return; settled = true; cleanup(); try { popup.close(); } catch {} reject(error); };
            const receive = async event => {
                if (settled || event.source !== popup || event.origin !== account.origin || event.data?.type !== 'softm:authorization' || event.data?.requestId !== requestId) return;
                const code = event.data.code;
                if (!PROOF.test(code)) return stop(new Error('잘못된 로그인 응답입니다.'));
                settled = true; cleanup();
                try {
                    const response = await fetch(new URL('/api/connect/exchange', account), { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: siteId, origin: location.origin, code, verifier }), cache: 'no-store' });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message || '로그인을 완료하지 못했습니다.');
                    if (!PROOF.test(data.accessToken) || typeof data.uid !== 'string' || !data.uid || data.uid.length > 128 || !Number.isFinite(data.expiresIn) || data.expiresIn <= 0 || data.expiresIn > 3600) throw new Error('계정 서버가 올바른 세션을 반환하지 않았습니다.');
                    auth = { token: data.accessToken, uid: data.uid, expiresAt: Date.now() + data.expiresIn * 1000, displayName: text(data.displayName, 120), photoURL: httpsUrl(data.photoURL) };
                    try { sessionStorage.setItem(storageKey, JSON.stringify(auth)); } catch {}
                    try { popup.close(); } catch {}
                    resolve(currentUser());
                } catch (error) { try { popup.close(); } catch {} reject(error); }
            };
            window.addEventListener('message', receive);
            timer = setTimeout(() => stop(new Error('로그인 시간이 만료됐습니다. 다시 시도해 주세요.')), 300000);
            watch = setInterval(() => { if (popup.closed) stop(new Error('로그인 창이 닫혔습니다.')); }, 700);
            popup.location.assign(url.href);
        });
    }
    async function logout() {
        try {
            if (currentUser()) await fetch(new URL(`/api/apps/${siteId}/logout`, account), { method: 'POST', mode: 'cors', credentials: 'omit', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
        } finally {
            clearSession();
        }
    }
    return Object.freeze({ login, logout, request, fetchBlob, get currentUser() { return currentUser(); } });
}

const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
if (browser) void mountPortal();

async function mountPortal() {
    const $ = id => document.getElementById(id);
    const client = createAccountClient();
    const panels = ['authPanel', 'claimPanel', 'claimPendingPanel', 'agreementPanel', 'workspace'];
    const state = { membership: null, institution: null, profile: null, photos: [], statsLoaded: false, publishStatus: 'draft', contentRevision: null, conflict: false, canManage: false, canEdit: false, photoRenderToken: 0, photoObjectUrls: new Map() };
    const setGlobal = (message, kind = '') => { $('globalStatus').textContent = message; $('globalStatus').dataset.state = kind; };
    const formStatus = (id, message = '', kind = '') => { const element = $(id); element.textContent = message; element.dataset.state = kind; };
    const busy = (button, value) => { if (button) button.disabled = value; };
    function updateContentRevision(data) {
        const revision = contentRevision(data);
        if (revision === null) throw new Error('기관 정보 변경 기준을 확인할 수 없습니다. 서버 최신 내용을 새로 불러와 주세요.');
        state.contentRevision = revision;
        return revision;
    }
    async function mutate(path, options = {}) {
        const headers = { ...(options.headers || {}), 'If-Match': contentIfMatch(state.contentRevision) };
        const data = await client.request(path, { ...options, headers });
        updateContentRevision(data);
        return data;
    }
    function clearContentConflict() {
        state.conflict = false;
        $('revisionConflict').hidden = true;
    }
    function handleContentConflict(error, statusId = '') {
        if (!isContentConflict(error)) return false;
        state.conflict = true;
        $('revisionConflict').hidden = false;
        applyAccessMode();
        const message = '다른 담당자가 기관 정보를 변경했습니다. 현재 입력 내용은 유지됩니다. 서버 최신 내용을 새로 불러온 뒤 다시 확인해 주세요.';
        setGlobal(message, 'error');
        if (statusId) formStatus(statusId, message, 'error');
        $('reloadWorkspaceButton').focus();
        return true;
    }
    function show(name) { for (const id of panels) $(id).hidden = id !== name; }
    function showAuth() {
        show('authPanel'); $('logoutButton').hidden = true; setGlobal('기관 담당자 계정으로 로그인해 주세요.');
    }
    function loginState() { $('logoutButton').hidden = !client.currentUser; }
    function acceptedAgreement(institution) {
        return hasCurrentPilotAgreement(institution);
    }
    function firstApprovedInstitution(data) {
        const institutions = Array.isArray(data?.institutions) ? data.institutions : [];
        return institutions.find(institution => INSTITUTION_ID.test(String(institution?.id || '')) && institution?.membership?.approvedAt)
            || institutions.find(institution => INSTITUTION_ID.test(String(institution?.id || '')))
            || null;
    }
    async function loadMe() {
        if (!client.currentUser) { showAuth(); return; }
        loginState(); setGlobal('연결된 기관과 시범운영 상태를 확인하고 있습니다.');
        try {
            const data = await client.request('/api/institutions/me');
            const institution = firstApprovedInstitution(data);
            if (!institution) {
                const pending = Array.isArray(data?.pendingClaims) ? data.pendingClaims[0] : null;
                if (!pending) { show('claimPanel'); setGlobal('관리할 기관의 연결 승인을 신청해 주세요.'); return; }
                show('claimPendingPanel');
                $('claimPendingText').textContent = `${text(pending.institutionName, 120) || '신청 기관'}의 담당자 정보를 운영자가 확인한 뒤 관리 권한을 연결합니다.`;
                setGlobal('기관 연결 신청을 확인하고 있습니다.');
                return;
            }
            state.membership = institution.membership || null;
            state.institution = institution;
            const access = institutionAccess(state.membership?.role, institution.status);
            if (!acceptedAgreement(institution) && access.canEdit) { show('agreementPanel'); setGlobal('무료 시범운영 범위를 확인하면 기관 정보 관리를 시작할 수 있습니다.'); return; }
            show('workspace');
            await loadWorkspace(institution);
        } catch (error) {
            if (error.status === 401) { showAuth(); setGlobal('로그인이 만료됐습니다. 다시 로그인해 주세요.', 'error'); return; }
            if (error.status === 404 || error.code === 'claim_required') { show('claimPanel'); setGlobal('관리할 기관의 연결 승인을 신청해 주세요.'); return; }
            showAuth(); setGlobal(error.message, 'error');
        }
    }
    async function loadWorkspace(initial = {}) {
        const institutionId = state.institution?.id;
        if (!INSTITUTION_ID.test(institutionId)) throw new Error('연결된 기관기호를 확인할 수 없습니다.');
        $('workspaceInstitution').textContent = state.institution.name || state.institution.institutionName || `기관기호 ${institutionId}`;
        const access = institutionAccess(state.membership?.role, initial.status);
        $('workspaceMeta').textContent = `기관기호 ${institutionId} · 무료 시범운영${access.canEdit ? '' : ' · 조회 전용'}`;
        const data = initial;
        updateContentRevision(data);
        clearContentConflict();
        state.profile = { ...(data.profile || {}), programs: Array.isArray(data.programs) ? data.programs : [] };
        state.photos = Array.isArray(data.photos) ? data.photos.slice(0, MAX_PHOTOS) : [];
        fillProfile(state.profile);
        setPublishStatus(data.status || 'draft');
        applyAccessMode();
        renderPhotos();
        setGlobal(state.canEdit ? '기관 관리 화면을 불러왔습니다.' : data.status === 'suspended' ? '운영 중지 상태로 조회만 할 수 있습니다.' : '조회 전용 권한으로 기관 정보를 불러왔습니다.', 'success');
    }
    function setPublishStatus(statusValue) {
        const status = text(statusValue, 30).toLowerCase() || 'draft';
        const label = status === 'published' ? '공개 중' : status === 'pending' ? '공개 처리 중' : status === 'rejected' ? '수정 필요' : status === 'suspended' ? '운영 중지' : '임시 저장';
        state.publishStatus = status;
        $('publishStatus').textContent = label; $('publishStatus').dataset.status = status;
    }
    function applyAccessMode() {
        const access = institutionAccess(state.membership?.role, state.publishStatus);
        state.canManage = access.canManage;
        state.canEdit = access.canEdit && !state.conflict;
        for (const control of $('profileForm').querySelectorAll('input,textarea,button')) control.disabled = !state.canEdit;
        $('profileForm').querySelector('.form-actions').hidden = !state.canEdit;
        $('photoUploadForm').hidden = !state.canEdit;
        for (const card of $('photoManager').querySelectorAll('.managed-photo')) {
            const input = card.querySelector('input'); if (input) input.disabled = !state.canEdit;
            const actions = card.querySelector('.managed-photo-actions'); if (actions) actions.hidden = !state.canEdit;
        }
        if (!state.canEdit) formStatus('profileStatus', state.conflict ? '다른 담당자의 변경이 확인되어 수정을 잠시 멈췄습니다. 현재 입력을 검토한 뒤 서버 최신 내용을 명시적으로 새로 불러와 주세요.' : state.publishStatus === 'suspended' ? '운영 중지 상태에서는 정보를 수정하거나 게시할 수 없습니다.' : '조회 전용 권한입니다. 운영정보와 통계는 확인할 수 있지만 수정·게시할 수 없습니다.');
    }
    function values(form) { return Object.fromEntries(new FormData(form).entries()); }
    function countTextareas() {
        for (const name of ['summary']) {
            const input = $('profileForm').elements[name], counter = document.querySelector(`[data-count-for="${name}"]`);
            counter.textContent = input.value.length.toLocaleString('ko-KR');
        }
    }
    function operatingHoursNote(value) {
        if (typeof value === 'string') return text(value, 200);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
        const summary = text(value.note || value.summary || value.text, 200);
        if (summary) return summary;
        const labels = { monday: '월', tuesday: '화', wednesday: '수', thursday: '목', friday: '금', saturday: '토', sunday: '일', holiday: '공휴일' };
        return Object.entries(value).flatMap(([key, item]) => {
            const hours = text(item, 80);
            return hours ? [`${labels[key] || text(key, 20)} ${hours}`] : [];
        }).slice(0, 8).join(' · ').slice(0, 200);
    }
    function addProgram(program = {}) {
        if ($('programList').children.length >= 10) { formStatus('profileStatus', '프로그램은 최대 10개까지 등록할 수 있습니다.', 'error'); return; }
        const row = document.createElement('div'); row.className = 'program-row'; row.dataset.programId = text(program.id, 100);
        for (const [name, placeholder, max] of [['title', '프로그램명', 120], ['schedule', '운영 일정', 120], ['description', '대상·내용 안내', 500]]) {
            const input = document.createElement('input'); input.name = `program-${name}`; input.placeholder = placeholder; input.maxLength = max; input.value = text(program[name], max); input.setAttribute('aria-label', placeholder); row.append(input);
        }
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'program-remove'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `${text(program.title, 120) || '프로그램'} 삭제`); remove.onclick = () => row.remove(); row.append(remove); $('programList').append(row);
    }
    function programs() {
        return [...$('programList').children].map((row, index) => ({ id: row.dataset.programId, title: row.querySelector('[name="program-title"]').value, schedule: row.querySelector('[name="program-schedule"]').value, description: row.querySelector('[name="program-description"]').value, sortOrder: index, active: true }));
    }
    function fillProfile(profile = {}) {
        const form = $('profileForm');
        for (const name of ['displayName', 'summary', 'phone', 'email', 'website', 'address', 'transportation']) form.elements[name].value = text(profile[name], name === 'summary' ? 2000 : 500);
        form.elements.operatingHours.value = operatingHoursNote(profile.operatingHours);
        form.elements.operatingHours.dataset.initialValue = form.elements.operatingHours.value;
        form.elements.capacity.value = profile.capacity !== null && profile.capacity !== undefined && profile.capacity !== '' && Number.isSafeInteger(Number(profile.capacity)) && Number(profile.capacity) >= 0 ? String(profile.capacity) : '';
        form.elements.availableSlots.value = profile.availableSlots !== null && profile.availableSlots !== undefined && profile.availableSlots !== '' && Number.isSafeInteger(Number(profile.availableSlots)) && Number(profile.availableSlots) >= 0 ? String(profile.availableSlots) : '';
        $('programList').replaceChildren();
        for (const program of Array.isArray(profile.programs) ? profile.programs.slice(0, 10) : []) addProgram(program);
        countTextareas();
    }
    function collectProfile() {
        const form = $('profileForm'), raw = values(form); raw.programs = programs();
        const profile = validateProfile(raw), originalHours = state.profile?.operatingHours;
        if (raw.operatingHours === form.elements.operatingHours.dataset.initialValue && originalHours && typeof originalHours === 'object' && !Array.isArray(originalHours)) profile.operatingHours = originalHours;
        return profile;
    }
    async function saveProfile({ announce = true } = {}) {
        const payload = collectProfile();
        const data = await mutate(`/api/institutions/${state.institution.id}/profile`, { method: 'PUT', body: payload });
        state.profile = { ...(data.profile || payload), programs: Array.isArray(data.programs) ? data.programs : payload.programs };
        if (Array.isArray(data.photos)) state.photos = data.photos;
        setPublishStatus(data.status || 'draft');
        if (announce) formStatus('profileStatus', '운영정보를 임시 저장했습니다.', 'success');
        return data;
    }
    function institutionAssetUrl(value) {
        try {
            const url = new URL(String(value || ''), INSTITUTION_API_BASE);
            return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
        } catch {
            return '';
        }
    }
    function institutionPreviewPath(value) {
        const rawPath = typeof value === 'string' ? value.trim() : '';
        if (!rawPath.startsWith('/api/institutions/')) return '';
        try {
            const url = new URL(rawPath, INSTITUTION_API_BASE);
            return url.origin === new URL(INSTITUTION_API_BASE).origin && !url.search && !url.hash ? url.pathname : '';
        } catch {
            return '';
        }
    }
    function normalizePhoto(photo, index) {
        return { id: text(photo?.id, 100), previewPath: institutionPreviewPath(photo?.previewPath), url: institutionAssetUrl(photo?.url || photo?.publicUrl), altText: text(photo?.altText, 300), isCover: photo?.isCover === true, published: photo?.published !== false, sortOrder: Number(photo?.sortOrder ?? index) };
    }
    function photoActionButton(label, action, className = '') {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.action = action; if (className) button.className = className; return button;
    }
    function revokePhotoObjectUrls() {
        state.photoRenderToken++;
        for (const url of state.photoObjectUrls.values()) URL.revokeObjectURL(url);
        state.photoObjectUrls.clear();
    }
    async function setManagedPhotoSource(image, visual, photo, token) {
        visual.classList.add('is-loading');
        if (!photo.previewPath) {
            if (photo.url && state.publishStatus === 'published') image.src = photo.url;
            else { visual.classList.remove('is-loading'); visual.classList.add('is-error'); }
            return;
        }
        try {
            const blob = await client.fetchBlob(photo.previewPath);
            const objectUrl = URL.createObjectURL(blob);
            if (state.photoRenderToken !== token || !image.isConnected) { URL.revokeObjectURL(objectUrl); return; }
            state.photoObjectUrls.set(photo.id, objectUrl);
            image.src = objectUrl;
        } catch (error) {
            if (state.photoRenderToken === token && visual.isConnected) {
                visual.classList.remove('is-loading');
                visual.classList.add('is-error');
                visual.title = error.message;
            }
        }
    }
    function renderPhotos() {
        revokePhotoObjectUrls();
        const renderToken = state.photoRenderToken;
        const host = $('photoManager'); host.replaceChildren();
        state.photos = state.photos.map(normalizePhoto).filter(photo => photo.id && (photo.previewPath || photo.url)).sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder).slice(0, MAX_PHOTOS);
        $('photoTabCount').textContent = String(state.photos.length);
        if (!state.photos.length) { const empty = document.createElement('p'); empty.className = 'empty-manager'; empty.textContent = '등록한 사진이 없습니다. 기관의 공간과 프로그램을 잘 보여 주는 사진을 올려 주세요.'; host.append(empty); return; }
        state.photos.forEach((photo, index) => {
            const card = document.createElement('article'); card.className = 'managed-photo'; card.dataset.photoId = photo.id;
            const visual = document.createElement('div'); visual.className = 'managed-photo-image';
            const image = document.createElement('img'); image.alt = photo.altText || `기관 등록사진 ${index + 1}`; image.loading = 'lazy'; image.addEventListener('load', () => visual.classList.remove('is-loading'), { once: true }); image.addEventListener('error', () => { visual.classList.remove('is-loading'); visual.classList.add('is-error'); }, { once: true }); visual.append(image); void setManagedPhotoSource(image, visual, photo, renderToken);
            if (photo.isCover || !photo.published) { const badge = document.createElement('span'); badge.textContent = photo.isCover ? '대표사진' : '비공개'; visual.append(badge); }
            const fields = document.createElement('div'); fields.className = 'managed-photo-fields';
            const wrapper = document.createElement('label'); wrapper.textContent = '대체 설명'; const input = document.createElement('input'); input.name = 'altText'; input.maxLength = 300; input.value = photo.altText; input.disabled = !state.canEdit; wrapper.append(input); fields.append(wrapper);
            const actions = document.createElement('div'); actions.className = 'managed-photo-actions';
            actions.append(photoActionButton('설명 저장', 'save'), photoActionButton(photo.isCover ? '대표사진' : '대표로 지정', 'cover'), photoActionButton(photo.published ? '비공개로 전환' : '공개로 전환', 'published'), photoActionButton('삭제', 'delete', 'danger'));
            actions.hidden = !state.canEdit;
            fields.append(actions); card.append(visual, fields); host.append(card);
        });
    }
    window.addEventListener('pagehide', revokePhotoObjectUrls);
    window.addEventListener('pageshow', event => { if (event.persisted && state.institution && !state.conflict) renderPhotos(); });
    async function patchPhoto(card, changes) {
        const id = card.dataset.photoId;
        const photo = state.photos.find(item => item.id === id);
        if (!photo) return;
        const payload = { altText: text(card.querySelector('[name=altText]').value, 300), isCover: photo.isCover, published: photo.published, ...changes };
        const data = await mutate(`/api/institutions/${state.institution.id}/photos/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
        if (payload.isCover) state.photos.forEach(item => { item.isCover = item.id === id; });
        Object.assign(photo, payload, data || {});
        setPublishStatus('draft'); renderPhotos(); formStatus('photoUploadStatus', '사진 정보를 저장했습니다. 운영정보 탭에서 다시 공개해 주세요.', 'success');
    }
    function statNumber(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0; }
    function statRows(data) {
        const rows = data?.daily || [];
        return Array.isArray(rows) ? rows.map(row => ({ date: text(row.day, 10), detailViews: statNumber(row.detail_view), phoneClicks: statNumber(row.phone_click), inquiryClicks: statNumber(row.inquiry_click), directionsClicks: statNumber(row.directions_click) })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date)).slice(0, 31) : [];
    }
    function renderStats(data) {
        const rows = statRows(data);
        const totals = { detailViews: statNumber(data?.totals?.detail_view), phoneClicks: statNumber(data?.totals?.phone_click), inquiryClicks: statNumber(data?.totals?.inquiry_click), directionsClicks: statNumber(data?.totals?.directions_click) };
        const labels = [['detailViews', '상세 조회'], ['phoneClicks', '전화 선택'], ['inquiryClicks', '문의 선택'], ['directionsClicks', '길찾기']];
        $('statsSummary').replaceChildren(...labels.map(([key, label]) => { const box = document.createElement('div'); box.className = 'stat-box'; const name = document.createElement('span'); name.textContent = label; const value = document.createElement('strong'); value.textContent = totals[key].toLocaleString('ko-KR'); box.append(name, value); return box; }));
        $('statsBody').replaceChildren(...rows.map(row => { const tr = document.createElement('tr'); for (const value of [row.date, row.detailViews, row.phoneClicks, row.inquiryClicks, row.directionsClicks]) { const td = document.createElement('td'); td.textContent = typeof value === 'number' ? value.toLocaleString('ko-KR') : value; tr.append(td); } return tr; }));
        if (!rows.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5; td.textContent = '아직 집계된 조회 현황이 없습니다.'; tr.append(td); $('statsBody').append(tr); }
        formStatus('statsStatus', `최근 30일 중 ${rows.length}일의 집계를 확인했습니다.`, 'success');
    }
    async function loadStats() {
        busy($('refreshStatsButton'), true); formStatus('statsStatus', '조회 현황을 불러오고 있습니다.');
        try { renderStats(await client.request(`/api/institutions/${state.institution.id}/stats?days=30`)); state.statsLoaded = true; }
        catch (error) { formStatus('statsStatus', error.message, 'error'); }
        finally { busy($('refreshStatsButton'), false); }
    }

    $('loginButton').onclick = async () => { busy($('loginButton'), true); setGlobal('로그인 창에서 사용할 계정을 선택해 주세요.'); try { await client.login(); await loadMe(); } catch (error) { setGlobal(error.message, 'error'); } finally { busy($('loginButton'), false); } };
    $('logoutButton').onclick = async () => { busy($('logoutButton'), true); try { await client.logout(); location.reload(); } catch (error) { setGlobal(error.message, 'error'); busy($('logoutButton'), false); } };
    $('claimForm').onsubmit = async event => { event.preventDefault(); const button = event.submitter; busy(button, true); formStatus('claimStatus', '기관 연결 신청을 보내고 있습니다.'); try { const raw = values(event.currentTarget); raw.truthful = event.currentTarget.elements.truthful.checked; await client.request('/api/institutions/claim', { method: 'POST', body: validateClaim(raw) }); show('claimPendingPanel'); setGlobal('기관 연결 신청을 접수했습니다.', 'success'); } catch (error) { formStatus('claimStatus', error.message, 'error'); } finally { busy(button, false); } };
    $('agreementForm').onsubmit = async event => { event.preventDefault(); const button = event.submitter; busy(button, true); formStatus('agreementStatus', '확인 내용을 기록하고 있습니다.'); try { const payload = validateAgreement({ freePilot: event.currentTarget.elements.freePilot.checked, noPayment: event.currentTarget.elements.noPayment.checked, contentAuthority: event.currentTarget.elements.contentAuthority.checked }); await client.request(`/api/institutions/${state.institution.id}/pilot-agreement`, { method: 'POST', body: payload }); await loadMe(); } catch (error) { formStatus('agreementStatus', error.message, 'error'); } finally { busy(button, false); } };
    $('reloadWorkspaceButton').onclick = async () => {
        if (!confirm('서버 최신 내용을 불러오면 현재 화면에서 작성 중인 내용은 사라집니다. 계속할까요?')) return;
        const button = $('reloadWorkspaceButton'); busy(button, true); setGlobal('서버 최신 기관 정보를 다시 확인하고 있습니다.');
        try {
            const institutionId = state.institution?.id;
            const data = await client.request('/api/institutions/me');
            const institution = (Array.isArray(data?.institutions) ? data.institutions : []).find(item => String(item?.id || '') === institutionId);
            if (!institution || contentRevision(institution) === null) throw new Error('최신 기관 정보 또는 관리 권한을 확인할 수 없습니다.');
            const access = institutionAccess(institution.membership?.role, institution.status);
            state.membership = institution.membership || null;
            state.institution = institution;
            if (!acceptedAgreement(institution) && access.canEdit) { show('agreementPanel'); setGlobal('변경된 무료 시범운영 범위를 다시 확인해 주세요.'); return; }
            show('workspace');
            await loadWorkspace(institution);
        } catch (error) {
            if (error.status === 401) { showAuth(); setGlobal('로그인이 만료됐습니다. 다시 로그인해 주세요.', 'error'); }
            else setGlobal(`최신 내용을 불러오지 못했습니다. 현재 입력 내용은 유지됩니다. ${error.message}`, 'error');
        }
        finally { busy(button, false); }
    };
    $('profileForm').addEventListener('input', countTextareas);
    $('profileForm').onsubmit = async event => { event.preventDefault(); busy(event.submitter, true); formStatus('profileStatus', '운영정보를 저장하고 있습니다.'); try { await saveProfile(); } catch (error) { if (!handleContentConflict(error, 'profileStatus')) formStatus('profileStatus', error.message, 'error'); } finally { busy(event.submitter, false); } };
    $('submitProfileButton').onclick = async () => { busy($('submitProfileButton'), true); formStatus('profileStatus', '운영정보를 저장하고 공개 상태를 처리하고 있습니다.'); try { await saveProfile({ announce: false }); const data = await mutate(`/api/institutions/${state.institution.id}/submit`, { method: 'POST', body: {} }); setPublishStatus(data.status || 'published'); formStatus('profileStatus', data.status === 'pending' ? '공개 처리를 확인하고 있습니다.' : '기관 운영정보를 공개했습니다.', 'success'); } catch (error) { if (!handleContentConflict(error, 'profileStatus')) formStatus('profileStatus', error.message, 'error'); } finally { busy($('submitProfileButton'), false); } };
    $('addProgramButton').onclick = () => addProgram();
    $('photoUploadForm').onsubmit = async event => {
        event.preventDefault();
        const button = event.submitter;
        let uploaded = 0;
        busy(button, true);
        try {
            const files = validatePhotoFiles($('photoFiles').files, state.photos.length);
            for (let index = 0; index < files.length; index++) {
                formStatus('photoUploadStatus', `${files.length}장 중 ${index + 1}번째 사진을 올리고 있습니다.`);
                const body = new FormData();
                body.append('photo', files[index], files[index].name);
                body.append('altText', text(files[index].name.replace(/\.[^.]+$/, ''), 300));
                body.append('published', 'true');
                if (!state.photos.length) body.append('isCover', 'true');
                const data = await mutate(`/api/institutions/${state.institution.id}/photos`, { method: 'POST', body });
                if (data?.id) { state.photos.push(data); uploaded++; }
            }
            $('photoFiles').value = '';
            setPublishStatus('draft');
            renderPhotos();
            formStatus('photoUploadStatus', '선택한 사진을 등록했습니다. 설명과 대표사진을 확인한 뒤 운영정보 탭에서 다시 공개해 주세요.', 'success');
        } catch (error) {
            const recovery = photoUploadFailurePlan(uploaded, error);
            const conflict = handleContentConflict(error, 'photoUploadStatus');
            if (recovery.completed) setPublishStatus('draft');
            if (recovery.refreshPhotoManager) { $('photoFiles').value = ''; renderPhotos(); applyAccessMode(); }
            if (!conflict) formStatus('photoUploadStatus', uploaded ? `${uploaded}장은 등록됐습니다. 나머지 사진: ${error.message}` : error.message, 'error');
        } finally {
            busy(button, false);
        }
    };
    $('photoManager').onclick = async event => { const button = event.target.closest('button[data-action]'), card = button?.closest('.managed-photo'); if (!button || !card) return; busy(button, true); try { const photo = state.photos.find(item => item.id === card.dataset.photoId); if (!photo) return; if (button.dataset.action === 'delete') { if (!confirm('이 사진을 삭제할까요? 삭제한 사진은 복구할 수 없습니다.')) return; await mutate(`/api/institutions/${state.institution.id}/photos/${encodeURIComponent(photo.id)}`, { method: 'DELETE' }); state.photos = state.photos.filter(item => item.id !== photo.id); setPublishStatus('draft'); renderPhotos(); formStatus('photoUploadStatus', '사진을 삭제했습니다. 운영정보 탭에서 다시 공개해 주세요.', 'success'); return; } if (button.dataset.action === 'cover') await patchPhoto(card, { isCover: true }); else if (button.dataset.action === 'published') await patchPhoto(card, { published: !photo.published }); else await patchPhoto(card, {}); } catch (error) { if (!handleContentConflict(error, 'photoUploadStatus')) formStatus('photoUploadStatus', error.message, 'error'); } finally { busy(button, false); } };
    const tabButtons = [...document.querySelectorAll('[data-tab]')];
    function selectTab(button, focus = false) {
        const selected = button.dataset.tab;
        tabButtons.forEach(item => { const active = item === button; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
        document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== selected; });
        if (focus) button.focus();
        if (selected === 'stats' && !state.statsLoaded) void loadStats();
    }
    tabButtons.forEach((button, index) => {
        button.onclick = () => selectTab(button);
        button.onkeydown = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabButtons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
            selectTab(tabButtons[target], true);
        };
    });
    $('refreshStatsButton').onclick = loadStats;
    loginState(); await loadMe();
}
/** SOFTM-INSTITUTION-PORTAL END */
