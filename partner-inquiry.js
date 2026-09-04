/** SOFTM-PARTNER-FORM START 날짜:20260904 : 메일 앱 없이 두 지도의 제휴 문의를 접수하고 실패 시 입력을 보존 */
(() => {
    'use strict';
    let dialog;
    let opener;
    let openedFromList = false;
    let submitting = false;
    const config = () => window.PARTNER_INQUIRY_CONFIG || {};

    function setStatus(message, state = '') {
        const status = dialog.querySelector('.partner-status');
        status.textContent = message;
        status.dataset.state = state;
    }

    function mount() {
        if (dialog) return;
        dialog = document.createElement('dialog');
        dialog.className = 'partner-dialog';
        dialog.id = 'partnerInquiryDialog';
        dialog.setAttribute('aria-labelledby', 'partnerInquiryTitle');
        dialog.setAttribute('aria-describedby', 'partnerInquiryIntro');
        dialog.innerHTML = `
            <header>
                <div><small>돌봄한눈 · 광고·제휴</small><h2 id="partnerInquiryTitle">제휴 문의</h2></div>
                <button type="button" class="partner-close" aria-label="제휴 문의 닫기">×</button>
            </header>
            <div class="partner-body">
                <p class="partner-intro" id="partnerInquiryIntro">지역별 광고·제휴를 문의해 주세요. 남겨 주신 이메일로 답변드립니다.</p>
                <form>
                    <input type="checkbox" name="botcheck" hidden tabindex="-1" autocomplete="off" aria-hidden="true">
                    <fieldset class="partner-fields" aria-label="제휴 문의 내용">
                        <label>기관·업체명 <span>(필수)</span><input name="organization" autocomplete="organization" maxlength="120" required autofocus></label>
                        <label>담당자명 <span>(필수)</span><input name="name" autocomplete="name" maxlength="80" required></label>
                        <label class="partner-wide">회신 이메일 <span>(필수)</span><input type="email" name="email" autocomplete="email" maxlength="254" required></label>
                        <label>연락처 <span>(선택)</span><input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>
                        <label>광고 희망 지역 <span>(선택)</span><input name="region" placeholder="예: 경기 광명시" maxlength="120"></label>
                        <label class="partner-wide">문의 내용 <span>(필수)</span><textarea name="message" rows="4" maxlength="5000" placeholder="소개할 서비스와 희망 광고 내용을 알려주세요." required></textarea></label>
                        <label class="partner-wide partner-consent"><input type="checkbox" name="consent" required><span>입력한 정보를 제휴 상담 및 회신을 위해 전송하는 데 동의합니다. (필수)</span></label>
                    </fieldset>
                    <p class="partner-status" role="status" aria-live="polite" aria-atomic="true"></p>
                    <button type="submit" class="partner-submit">문의 보내기</button>
                </form>
                <p class="partner-fallback">이메일로 직접 문의: <a></a></p>
            </div>`;
        const fallback = dialog.querySelector('.partner-fallback a');
        fallback.textContent = config().recipientEmail || 'softm@nate.com';
        fallback.href = `mailto:${encodeURIComponent(fallback.textContent)}?subject=${encodeURIComponent('[돌봄한눈] 광고·제휴 문의')}`;
        dialog.querySelector('.partner-close').addEventListener('click', close);
        dialog.addEventListener('click', event => {
            const rect = dialog.getBoundingClientRect();
            if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
        });
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            close();
        });
        dialog.addEventListener('close', () => {
            document.documentElement.classList.remove('partner-inquiry-open');
            const target = opener?.isConnected ? opener
                : document.querySelector(openedFromList ? '#list [data-partner-inquiry]' : '[data-partner-inquiry]') || document.getElementById('q');
            target?.focus({ preventScroll: true });
        });
        dialog.querySelector('form').addEventListener('submit', submit);
        document.body.appendChild(dialog);
    }

    function open(trigger) {
        mount();
        if (dialog.open) return;
        opener = trigger || document.activeElement;
        openedFromList = Boolean(opener?.closest('#list'));
        dialog.showModal();
        document.documentElement.classList.add('partner-inquiry-open');
        if (!String(config().accessKey || '').trim()) {
            setStatus('문의 접수 연결을 준비하고 있습니다. 아래 이메일로 직접 문의해 주세요.', 'error');
        }
    }

    function close() {
        if (!submitting) dialog.close();
    }

    async function submit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (submitting || !form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        if (data.botcheck) return;
        for (const name of ['organization', 'name', 'email', 'message']) {
            if (!String(data[name] || '').trim()) {
                setStatus('필수 항목에 공백만 입력할 수 없습니다.', 'error');
                form.elements.namedItem(name).focus();
                return;
            }
        }
        const accessKey = String(config().accessKey || '').trim();
        if (!accessKey) {
            setStatus('문의 접수 연결을 준비하고 있습니다. 아래 이메일로 직접 문의해 주세요.', 'error');
            return;
        }
        const payload = {
            access_key: accessKey,
            subject: '[돌봄한눈] 광고·제휴 문의',
            from_name: '돌봄한눈 제휴 문의',
            name: data.name.trim(),
            email: data.email.trim(),
            organization: data.organization.trim(),
            phone: String(data.phone || '').trim(),
            region: String(data.region || '').trim(),
            message: data.message.trim(),
            consent: '제휴 상담 및 회신을 위한 정보 전송 동의',
            page: `${location.origin}${location.pathname}`,
            category: new URLSearchParams(location.search).get('type') || 'daycare',
            botcheck: false
        };
        submitting = true;
        const fields = form.querySelector('fieldset');
        const button = form.querySelector('.partner-submit');
        const closeButton = dialog.querySelector('.partner-close');
        fields.disabled = button.disabled = closeButton.disabled = true;
        form.setAttribute('aria-busy', 'true');
        button.textContent = '보내는 중…';
        setStatus('문의 내용을 전송하고 있습니다.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            const result = await response.json();
            if (!response.ok || result.success !== true) {
                setStatus(response.status === 429
                    ? '잠시 후 다시 시도해 주세요. 요청이 많아 전송이 제한되었습니다.'
                    : '문의가 접수되지 않았습니다. 입력 내용은 유지됩니다. 다시 시도하거나 아래 이메일로 문의해 주세요.', 'error');
                return;
            }
            form.reset();
            setStatus('문의가 접수되었습니다. 남겨 주신 이메일로 답변드리겠습니다.', 'success');
        } catch (error) {
            setStatus(error.name === 'AbortError'
                ? '응답이 늦어 접수 여부를 확인하지 못했습니다. 중복 문의를 피하려면 잠시 후 확인해 주세요. 입력 내용은 유지됩니다.'
                : '전송 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 네트워크 연결을 확인하거나 아래 이메일로 문의해 주세요.', 'error');
        } finally {
            clearTimeout(timeout);
            submitting = false;
            fields.disabled = button.disabled = closeButton.disabled = false;
            form.removeAttribute('aria-busy');
            button.textContent = '문의 보내기';
        }
    }

    document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-partner-inquiry]');
        if (!trigger) return;
        event.preventDefault();
        open(trigger);
    });
    document.addEventListener('keydown', event => {
        if (dialog?.open && event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }
    }, true);
    window.PartnerInquiry = { open };
})();
/** SOFTM-PARTNER-FORM END */
