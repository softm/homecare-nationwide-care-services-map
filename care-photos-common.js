/** SOFTM-PHOTO-COMMON START 날짜:20260910 : 탐색과 두 지도의 사진 비교가 같은 분류·기관 연결·오류 처리를 사용 */
export const groups = ['전체', '외관', '생활공간', '프로그램/재활', '식사', '위생', '기타'];
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export function classify(title) {
    const text = String(title || '').replace(/\s+/g, '');
    if (/화장실|욕실|목욕|세면|위생/.test(text)) return '위생';
    if (/식당|식사|급식|주방|조리|간식/.test(text)) return '식사';
    if (/프로그램|재활|물리치료|작업치료|인지|운동|체조/.test(text)) return '프로그램/재활';
    if (/외관|외부|건물|시설전경|센터전경|주차|정원|옥상|입구/.test(text)) return '외관';
    if (/생활실|침실|거실|휴게|내부|복도|상담실|사무실/.test(text)) return '생활공간';
    return '기타';
}
export function photoUrl(photo) {
    try {
        const url = new URL(photo?.thumbnailUrl || photo?.url);
        return url.protocol === 'https:' && url.hostname === 'www.longtermcare.or.kr' ? url.href : '';
    } catch { return ''; }
}
export function mapUrl(type, row) {
    return `nationwide-care-services-map.html?${new URLSearchParams({ type, institution: row.i, p: row.p || '', c: row.c || '', q: row.n })}`;
}
export function filterRows(rows, summaries, { p = '', c = '', q = '' } = {}) {
    const query = q.trim().toLocaleLowerCase();
    return rows.filter(row => summaries[row.i]?.count > 0 && (!p || row.p === p) && (!c || row.c === c) && (!query || row.n.toLocaleLowerCase().includes(query)))
        .sort((a, b) => a.n.localeCompare(b.n, 'ko') || a.i.localeCompare(b.i));
}
export async function readJson(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`자료를 불러오지 못했습니다. (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const value = bytes[0] === 0x1f && bytes[1] === 0x8b
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(bytes);
    return JSON.parse(value);
}
export function thumbnail(photo, { viewer = false } = {}) {
    const figure = document.createElement('figure');
    figure.className = 'care-photo-figure';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'care-photo-image';
    if (viewer) button.dataset.photoViewer = '';
    else button.tabIndex = -1;
    const img = document.createElement('img');
    img.alt = photo?.title || '공단 등록사진'; img.loading = 'lazy'; img.decoding = 'async';
    const caption = document.createElement('figcaption');
    caption.textContent = `${photo?.title || '공단 등록사진'}${photo?.date ? ` · 등록일 ${photo.date}` : ''}`;
    const error = document.createElement('div'); error.className = 'care-photo-image-error'; error.hidden = true;
    error.innerHTML = '<span>사진 파일을 불러오지 못했습니다.</span><button type="button">다시 시도</button>';
    const retry = error.querySelector('button');
    const load = () => {
        const url = photoUrl(photo);
        error.hidden = true; button.hidden = false;
        if (!url) { fail(); return; }
        img.src = url;
    };
    const fail = () => { button.hidden = true; error.hidden = false; };
    img.addEventListener('error', fail);
    retry.addEventListener('click', load);
    button.append(img); figure.append(button, error, caption); load();
    return figure;
}
let compareDialog, compareToken = 0;
export function openComparison({ rows, type, opener, title = '담은 기관 사진 비교' }) {
    if (!rows.length) return;
    if (compareDialog?.open) compareDialog.close();
    compareDialog?.remove();
    const token = ++compareToken;
    const dialog = document.createElement('dialog'); compareDialog = dialog;
    dialog.className = 'care-photo-dialog';
    dialog.setAttribute('aria-labelledby', 'carePhotoCompareTitle');
    dialog.innerHTML = `<header class="care-photo-dialog-head"><div><h2 id="carePhotoCompareTitle">${escapeHtml(title)}</h2><p>공단 등록사진 · 제목 기준 분류 · 등록일은 촬영일과 다를 수 있습니다.</p></div><button type="button" data-photo-close autofocus>닫기</button></header><div class="care-photo-categories" role="group" aria-label="사진 공간 분류">${groups.map((group, i) => `<button type="button" aria-pressed="${i === 0}" data-photo-group="${escapeHtml(group)}">${group}</button>`).join('')}</div><div class="care-photo-columns" tabindex="0" aria-label="기관별 사진 비교, 좌우로 이동"></div>`;
    document.body.append(dialog);
    const columns = dialog.querySelector('.care-photo-columns');
    let group = '전체';
    const entries = rows.map(row => {
        const section = document.createElement('section'); section.className = 'care-photo-column';
        section.innerHTML = `<h3>${escapeHtml(row.n)}</h3><p>${escapeHtml(row.a)}</p><a href="${escapeHtml(mapUrl(type, row))}" rel="nofollow">지도에서 보기</a><div class="care-photo-gallery" data-photo-gallery data-photo-institution="${escapeHtml(row.n)}"></div>`;
        columns.append(section);
        return { row, host: section.querySelector('[data-photo-gallery]'), state: 'loading', photos: [] };
    });
    function render(entry) {
        entry.host.replaceChildren();
        const message = document.createElement('p'); message.setAttribute('role', 'status');
        if (type === 'nursing-hospital') message.textContent = '요양병원은 공단 등록사진 제공 대상이 아닙니다.';
        else if (entry.state === 'loading') message.textContent = '사진 정보를 불러오고 있습니다.';
        else if (entry.state === 'error') {
            message.textContent = '사진 정보를 불러오지 못했습니다. ';
            const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '다시 시도';
            retry.onclick = () => void load(entry); message.append(retry);
        } else {
            const visible = entry.photos.filter(photo => group === '전체' || classify(photo.title) === group);
            message.textContent = !entry.photos.length ? '등록사진이 없습니다.' : !visible.length ? '이 분류에 해당하는 사진이 없습니다.' : `${visible.length}장`;
            entry.host.append(message);
            for (const photo of visible) entry.host.append(thumbnail(photo, { viewer: true }));
            return;
        }
        entry.host.append(message);
    }
    async function load(entry) {
        entry.state = 'loading'; render(entry);
        if (type === 'nursing-hospital') return;
        try {
            const data = await window.NhisStaticData.photos(entry.row.i);
            if (!dialog.open || token !== compareToken) return;
            if (!Array.isArray(data.photos)) throw new Error('사진 자료 형식 오류');
            entry.photos = data.photos; entry.state = 'ready';
        } catch { entry.state = 'error'; }
        if (dialog.open && token === compareToken) render(entry);
    }
    dialog.querySelector('[data-photo-close]').onclick = () => dialog.close();
    dialog.addEventListener('click', event => {
        const selected = event.target.closest('[data-photo-group]');
        if (!selected) return;
        group = selected.dataset.photoGroup;
        dialog.querySelectorAll('[data-photo-group]').forEach(button => button.setAttribute('aria-pressed', String(button === selected)));
        entries.forEach(render);
    });
    const keydown = event => {
        if (!dialog.open || event.defaultPrevented || document.querySelector('.photo-viewer[open]')) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dialog.close(); }
    };
    document.addEventListener('keydown', keydown, true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
    dialog.addEventListener('close', () => {
        if (token === compareToken) compareToken++;
        document.removeEventListener('keydown', keydown, true);
        document.documentElement.classList.remove('care-photo-comparing');
        opener?.focus({ preventScroll: true });
    }, { once: true });
    document.documentElement.classList.add('care-photo-comparing');
    dialog.showModal();
    entries.forEach(entry => void load(entry));
}
/** SOFTM-PHOTO-COMMON END */
