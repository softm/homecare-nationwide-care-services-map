/** SOFTM-PHOTO-VIEWER START 날짜:20260904 : 두 지도의 사진을 같은 확대창에서 탐색하고 닫을 때 기존 상세 화면을 보존 */
(function () {
    'use strict';

    let dialog, stage, caption, counter, previous, next, closeButton;
    let photos = [], current = 0, opener = null, renderToken = 0, touchStart = null;

    function createDialog() {
        if (dialog) return;
        dialog = document.createElement('dialog');
        dialog.className = 'photo-viewer';
        dialog.setAttribute('aria-labelledby', 'photoViewerTitle');
        dialog.innerHTML = `
            <div class="photo-viewer-layout">
                <header class="photo-viewer-header">
                    <div class="photo-viewer-heading">
                        <p id="photoViewerInstitution" class="photo-viewer-institution"></p>
                        <h2 id="photoViewerTitle">기관 사진 크게 보기</h2>
                    </div>
                    <button type="button" class="photo-viewer-close" aria-label="사진 보기 닫기" autofocus><span aria-hidden="true">×</span> 닫기</button>
                </header>
                <div class="photo-viewer-stage" aria-label="확대 사진"></div>
                <footer class="photo-viewer-footer">
                    <p class="photo-viewer-caption" id="photoViewerCaption"></p>
                    <div class="photo-viewer-controls">
                        <button type="button" class="photo-viewer-previous" aria-label="이전 사진"><span aria-hidden="true">←</span> 이전</button>
                        <p class="photo-viewer-counter" role="status" aria-live="polite" aria-atomic="true"></p>
                        <button type="button" class="photo-viewer-next" aria-label="다음 사진">다음 <span aria-hidden="true">→</span></button>
                    </div>
                    <p class="photo-viewer-help"><span class="photo-viewer-keyboard-hint">← → 방향키로 이동 · Esc로 닫기</span><span class="photo-viewer-touch-hint">사진을 좌우로 밀어서 이동할 수 있습니다</span></p>
                </footer>
            </div>`;
        document.body.appendChild(dialog);
        stage = dialog.querySelector('.photo-viewer-stage');
        caption = dialog.querySelector('.photo-viewer-caption');
        counter = dialog.querySelector('.photo-viewer-counter');
        previous = dialog.querySelector('.photo-viewer-previous');
        next = dialog.querySelector('.photo-viewer-next');
        closeButton = dialog.querySelector('.photo-viewer-close');
        previous.addEventListener('click', () => move(-1));
        next.addEventListener('click', () => move(1));
        closeButton.addEventListener('click', close);
        dialog.addEventListener('click', event => event.stopPropagation());
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            close();
        });
        dialog.addEventListener('close', () => {
            if (dialog.open) return;
            renderToken++;
            document.documentElement.classList.remove('photo-viewer-open');
            stage.replaceChildren();
            photos = [];
            touchStart = null;
            if (opener?.isConnected) opener.focus({ preventScroll: true });
            opener = null;
        });

        stage.addEventListener('touchstart', event => {
            touchStart = event.touches.length === 1
                ? { x: event.touches[0].clientX, y: event.touches[0].clientY, id: event.touches[0].identifier }
                : null;
        }, { passive: true });
        stage.addEventListener('touchend', event => {
            const start = touchStart;
            touchStart = null;
            if (!start || event.touches.length || (window.visualViewport?.scale || 1) > 1.01) return;
            const touch = [...event.changedTouches].find(item => item.identifier === start.id);
            if (!touch) return;
            const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
            if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
        }, { passive: true });
        stage.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
    }

    function showPhoto() {
        const photo = photos[current], token = ++renderToken;
        caption.textContent = photo.title;
        counter.textContent = `${current + 1} / ${photos.length}`;
        counter.setAttribute('aria-label', `전체 ${photos.length}장 중 ${current + 1}번째 사진`);
        previous.hidden = next.hidden = photos.length < 2;
        dialog.querySelector('.photo-viewer-help').hidden = photos.length < 2;
        const image = new Image(), status = document.createElement('p');
        image.className = 'photo-viewer-image';
        image.alt = photo.title;
        image.referrerPolicy = 'no-referrer';
        image.decoding = 'async';
        image.draggable = false;
        image.hidden = true;
        status.className = 'photo-viewer-message';
        status.setAttribute('role', 'status');
        status.textContent = '사진을 불러오고 있습니다.';
        stage.setAttribute('aria-busy', 'true');
        stage.replaceChildren(image, status);
        image.onload = () => {
            if (token !== renderToken || !dialog.open) return;
            image.hidden = false;
            status.hidden = true;
            stage.setAttribute('aria-busy', 'false');
        };
        image.onerror = () => {
            if (token !== renderToken || !dialog.open) return;
            status.textContent = photos.length > 1
                ? '사진을 불러오지 못했습니다. 이전·다음 사진을 확인해 주세요.'
                : '사진을 불러오지 못했습니다. 닫은 뒤 다시 시도해 주세요.';
            stage.setAttribute('aria-busy', 'false');
        };
        image.src = photo.url;
    }

    function move(direction) {
        if (!dialog?.open || photos.length < 2) return;
        current = (current + direction + photos.length) % photos.length;
        showPhoto();
    }

    function close() {
        if (dialog?.open) dialog.close();
    }

    function open(trigger) {
        const gallery = trigger.closest('[data-photo-gallery]');
        if (!gallery) return;
        const items = [...gallery.querySelectorAll('button[data-photo-viewer]')].flatMap(button => {
            const image = button.querySelector('img');
            if (!image) return [];
            try {
                const url = new URL(image.currentSrc || image.src, document.baseURI);
                if (!['http:', 'https:'].includes(url.protocol)) return [];
                return [{ button, url: url.href, title: image.alt || '기관 등록사진' }];
            } catch { return []; }
        });
        const index = items.findIndex(item => item.button === trigger);
        if (index < 0) return;
        createDialog();
        photos = items;
        current = index;
        opener = trigger;
        const institution = gallery.closest('.detail-sheet,.popup')?.querySelector('h3')?.textContent.trim();
        dialog.querySelector('#photoViewerInstitution').textContent = institution || '공단 등록사진';
        document.documentElement.classList.add('photo-viewer-open');
        if (!dialog.open) dialog.showModal();
        showPhoto();
        closeButton.focus({ preventScroll: true });
    }

    /** SOFTM-PHOTO-EVENTS START 날짜:20260904 : 사진 클릭·방향키·Esc가 뒤의 지도와 상세 팝업까지 조작하지 않도록 먼저 처리 */
    document.addEventListener('click', event => {
        const trigger = event.target.closest?.('button[data-photo-viewer]');
        if (!trigger) return;
        event.preventDefault();
        event.stopPropagation();
        open(trigger);
    }, true);
    document.addEventListener('keydown', event => {
        if (!dialog?.open) return;
        if (event.key === 'Tab') {
            event.preventDefault();
            event.stopImmediatePropagation();
            const controls = [closeButton, previous, next].filter(button => !button.hidden);
            const at = controls.indexOf(document.activeElement), direction = event.shiftKey ? -1 : 1;
            const target = at < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (at + direction + controls.length) % controls.length;
            controls[target].focus({ preventScroll: true });
            return;
        }
        if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        if (event.key !== 'Escape' && (event.altKey || event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === 'Escape') close();
        else move(event.key === 'ArrowLeft' ? -1 : 1);
    }, true);
    /** SOFTM-PHOTO-EVENTS END */
})();
/** SOFTM-PHOTO-VIEWER END */
