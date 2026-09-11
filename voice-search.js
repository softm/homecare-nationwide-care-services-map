/** SOFTM-VOICE-SEARCH START 날짜:20260909 : 사용자 동작으로만 음성을 인식하고 확인한 검색어만 기존 조회에 전달 */
(function (root) {
    'use strict';
    const messages = {
        'not-allowed': '마이크 권한이 차단되었습니다. 브라우저의 사이트 설정에서 마이크를 허용한 뒤 다시 시도해 주세요.',
        'service-not-allowed': '이 브라우저에서 음성 인식 서비스를 사용할 수 없습니다. 검색어를 직접 입력해 주세요.',
        'audio-capture': '마이크를 찾을 수 없습니다. 기기의 마이크 연결과 권한을 확인해 주세요.',
        'no-speech': '음성이 들리지 않았습니다. 마이크를 눌러 다시 말해 주세요.',
        network: '음성 인식 서비스에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
    };
    function createSession(Recognition, update) {
        let current = null, generation = 0, stopTimer = null, responseTimer = null; // SOFTM-VOICE-RESPONSE 날짜:20260911 : 시작·입력·중지 단계마다 응답 없는 대기를 해제
        function cancel() {
            clearTimeout(stopTimer); stopTimer = null; clearTimeout(responseTimer); responseTimer = null;
            generation++;
            const previous = current; current = null;
            if (previous) { try { previous.abort(); } catch {} }
        }
        function start() {
            cancel();
            if (!Recognition) { update({ state: 'error', message: '이 브라우저는 음성검색을 지원하지 않습니다. 검색어를 직접 입력해 주세요.' }); return; }
            const token = generation;
            let recognizer, failed = false, heard = false, audio = false, sound = false;
            const emit = value => { if (generation === token) update(value); };
            /** SOFTM-VOICE-RESPONSE START 날짜:20260911 : 서비스가 시작된 채 응답하지 않는 경우 실제 입력 단계에 맞춰 대기를 종료 */
            const armResponseTimeout = (delay = 20000) => {
                clearTimeout(responseTimer);
                responseTimer = setTimeout(() => {
                    if (generation !== token) return;
                    const message = heard ? '인식한 검색어가 입력되었습니다. 확인 후 조회하거나 다시 말해 주세요.' : sound ? '소리는 감지했지만 텍스트 변환 응답이 없습니다. Chrome 음성 인식 서비스 연결을 확인하고 다시 시도해 주세요.' : audio ? '마이크는 연결됐지만 말소리가 감지되지 않았습니다. Chrome에서 선택한 마이크와 기기의 마이크 음소거를 확인해 주세요.' : '마이크 입력 시작 응답이 없습니다. Chrome의 마이크 권한과 입력 장치를 확인한 뒤 다시 시도해 주세요.';
                    cancel(); update({ state: heard ? 'ready' : 'error', message });
                }, delay);
            };
            /** SOFTM-VOICE-RESPONSE END */
            try {
                recognizer = new Recognition(); current = recognizer;
                recognizer.lang = 'ko-KR'; recognizer.continuous = false; recognizer.interimResults = true; recognizer.maxAlternatives = 1;
                /** SOFTM-VOICE-INPUT START 날짜:20260911 : 서비스 시작을 실제 음성 감지로 오인하지 않도록 입력 단계별로 안내 */
                recognizer.onstart = () => emit({ state: 'listening', message: '음성 인식이 시작됐습니다. 마이크 입력을 기다리고 있습니다.' });
                recognizer.onaudiostart = () => { if (generation !== token) return; audio = true; armResponseTimeout(30000); emit({ state: 'listening', message: '마이크가 연결됐습니다. 지역명이나 기관명을 말해 주세요.' }); };
                recognizer.onsoundstart = () => { if (generation !== token) return; sound = true; emit({ state: 'listening', message: '소리가 들어오고 있습니다. 말씀하신 내용을 인식하고 있습니다.' }); };
                recognizer.onspeechstart = () => { if (generation !== token) return; sound = true; armResponseTimeout(30000); emit({ state: 'listening', message: '말소리를 감지했습니다. 검색어로 변환하고 있습니다.' }); };
                /** SOFTM-VOICE-INPUT END */
                recognizer.onresult = event => {
                    if (generation !== token || failed) return; // SOFTM-VOICE-RESPONSE 날짜:20260911 : 종료한 인식기의 늦은 응답으로 상태가 되돌아가지 않게 보호
                    const text = Array.from(event.results, result => result[0].transcript).join(' ').trim();
                    heard ||= Boolean(text); emit({ state: 'listening', text, message: '인식한 내용을 확인해 주세요.' });
                };
                recognizer.onerror = event => { if (generation !== token) return; clearTimeout(responseTimer); failed = true; emit({ state: 'error', message: messages[event.error] || '음성을 인식하지 못했습니다. 다시 시도하거나 직접 입력해 주세요.' }); };
                recognizer.onend = () => {
                    if (generation !== token) return;
                    clearTimeout(stopTimer); stopTimer = null; clearTimeout(responseTimer); responseTimer = null; current = null;
                    if (!failed) emit({ state: 'ready', message: heard ? '검색어를 확인하거나 수정한 뒤 조회해 주세요.' : messages['no-speech'] });
                };
                emit({ state: 'starting', message: '마이크 연결 중입니다. 권한 요청이 표시되면 허용해 주세요.' });
                armResponseTimeout(); recognizer.start(); // SOFTM-VOICE-RESPONSE 날짜:20260911 : 시작 이벤트조차 오지 않는 연결 지연도 종료
            } catch { clearTimeout(responseTimer); current = null; failed = true; emit({ state: 'error', message: '음성검색을 시작하지 못했습니다. 마이크 권한을 확인하거나 직접 입력해 주세요.' }); }
        }
        /** SOFTM-VOICE-TEXT START 날짜:20260909 : 사용자가 말을 마칠 때 마지막 인식 결과를 버리지 않도록 중지와 취소를 분리 */
        function stop() {
            if (!current) return;
            clearTimeout(responseTimer); // SOFTM-VOICE-RESPONSE 날짜:20260911 : 명시적 중지 후에는 최종 응답 타이머 하나만 사용
            update({ state: 'stopping', message: '말씀하신 내용을 텍스트로 변환하고 있습니다…' });
            stopTimer = setTimeout(() => { cancel(); update({ state: 'error', message: '음성 변환 응답이 지연됩니다. 표시된 검색어를 사용하거나 다시 말해 주세요.' }); }, 8000);
            try { current.stop(); } catch { cancel(); update({ state: 'error', message: '인식을 마치지 못했습니다. 다시 말하거나 검색어를 직접 입력해 주세요.' }); }
        }
        return { start, stop, cancel };
        /** SOFTM-VOICE-TEXT END */
    }
    function mount({ input, search }) {
        if (!input || input.closest('.care-voice-input')) return;
        const icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
        const wrapper = document.createElement('div'); wrapper.className = 'care-voice-input'; input.before(wrapper); wrapper.append(input);
        /** SOFTM-SEARCH-CLEAR START 날짜:20260911 : 긴 검색어를 지우기 위해 키보드 삭제를 반복하지 않고 입력창 안에서 한 번에 초기화 */
        const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'care-search-clear'; clear.setAttribute('aria-label', '검색어 지우기'); clear.title = '검색어 지우기'; clear.textContent = '×'; wrapper.append(clear);
        const syncClear = () => { clear.hidden = !input.value; };
        clear.onclick = () => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); syncClear(); input.focus({ preventScroll: true }); };
        input.addEventListener('input', syncClear); syncClear();
        /** SOFTM-SEARCH-CLEAR END */
        const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'care-voice-trigger'; trigger.setAttribute('aria-label', '음성검색'); trigger.innerHTML = icon; wrapper.append(trigger);
        const dialog = document.createElement('dialog'); dialog.className = 'care-voice-dialog'; dialog.setAttribute('aria-labelledby', 'careVoiceTitle');
        dialog.innerHTML = '<button type="button" class="care-voice-close" aria-label="음성검색 닫기">×</button><h2 id="careVoiceTitle">음성으로 검색</h2><p class="care-voice-example">지역명이나 기관명을 말해보세요<br><span>“광명” · “행복주간보호센터”</span></p><button type="button" class="care-voice-record" aria-label="음성 인식 시작">' + icon + '</button><p class="care-voice-status" role="status" aria-live="polite"></p><label for="careVoiceText">검색어 확인·수정</label><input id="careVoiceText" type="search" autocomplete="off" placeholder="검색어를 직접 입력할 수도 있어요"><button type="button" class="care-voice-submit">이 내용으로 조회</button><p class="care-voice-notice">음성은 브라우저의 음성 인식 서비스에서 처리될 수 있습니다.</p>';
        document.body.append(dialog);
        const transcript = dialog.querySelector('input'), record = dialog.querySelector('.care-voice-record'), status = dialog.querySelector('.care-voice-status'), submit = dialog.querySelector('.care-voice-submit');
        const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
        const session = createSession(Recognition, result => {
            if (!dialog.open) return;
            if (result.text !== undefined && result.text.trim()) { transcript.value = result.text; input.value = result.text; input.dispatchEvent(new Event('input', { bubbles: true })); syncClear(); } // SOFTM-SEARCH-CLEAR 날짜:20260911 : 음성으로 채운 검색어도 지우기 버튼 상태에 즉시 반영
            status.textContent = result.message;
            const busy = ['listening', 'starting', 'stopping'].includes(result.state);
            record.disabled = result.state === 'stopping'; // SOFTM-VOICE-TEXT 날짜:20260909 : 최종 결과를 기다리는 동안 재시작으로 결과가 취소되지 않도록 보호
            record.dataset.listening = String(busy); record.setAttribute('aria-label', busy ? '음성 인식 중지' : '음성 인식 다시 시작');
            submit.disabled = !transcript.value.trim();
        });
        function stop() { session.cancel(); record.disabled = !Recognition || !root.isSecureContext; record.dataset.listening = 'false'; record.setAttribute('aria-label', '음성 인식 다시 시작'); }
        function close() { stop(); dialog.close(); }
        trigger.onclick = () => {
            transcript.value = input.value; submit.disabled = !transcript.value.trim(); dialog.showModal(); record.focus(); // SOFTM-VOICE-TEXT 날짜:20260909 : 재시도나 오류에도 기존 검색어를 보존
            record.disabled = !Recognition || !root.isSecureContext;
            status.textContent = !root.isSecureContext ? '보안 연결(HTTPS)에서 음성검색을 사용할 수 있습니다. 검색어를 직접 입력해 주세요.' : !Recognition ? '이 브라우저는 음성검색을 지원하지 않습니다. 검색어를 직접 입력해 주세요.' : '듣고 있습니다. 지역명이나 기관명을 말해 주세요.';
            if (!record.disabled) session.start(); // SOFTM-VOICE-TEXT 날짜:20260909 : 검색창 마이크 한 번으로 바로 인식을 시작
        };
        record.onclick = () => {
            if (record.dataset.listening === 'true') { session.stop(); } // SOFTM-VOICE-TEXT 날짜:20260909 : 중지 시 abort 대신 stop으로 마지막 텍스트를 수신
            else session.start();
        };
        transcript.oninput = () => { stop(); input.value = transcript.value; syncClear(); submit.disabled = !transcript.value.trim(); };
        submit.onclick = () => { const text = transcript.value.trim(); if (!text) return; input.value = text; syncClear(); close(); search(); };
        transcript.onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit.click(); } };
        dialog.querySelector('.care-voice-close').onclick = close;
        dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); close(); });
        dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }); // SOFTM-VOICE-TEXT 날짜:20260909 : Esc의 검색 입력 초기화보다 창 닫기를 먼저 처리해 인식 텍스트를 보존
        dialog.addEventListener('close', () => { stop(); trigger.focus({ preventScroll: true }); });
        root.addEventListener('pagehide', stop);
        document.addEventListener('visibilitychange', () => { if (document.hidden && dialog.open) { stop(); status.textContent = '음성 인식이 중지되었습니다. 다시 시작해 주세요.'; } });
    }
    root.CareVoiceSearch = Object.freeze({ createSession, mount });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-VOICE-SEARCH END */
