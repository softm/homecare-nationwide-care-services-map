/** SOFTM-CARE-COST-UI START 날짜:20260904 : 비용 안내와 두 지도 상세에서 같은 조건·계산을 사용하고 개인 입력은 세션에만 보관 */
(function (root) {
  'use strict';
  const services = { facility: '요양원·공동생활가정', daycare: '주야간보호', 'home-care': '방문요양' };
  const bands = { '3-6': '3시간 이상 ~ 6시간 미만', '6-8': '6시간 이상 ~ 8시간 미만', '8-10': '8시간 이상 ~ 10시간 미만', '10-13': '10시간 이상 ~ 13시간 이하', '13-plus': '13시간 초과' };
  const kinds = { '1': '식재료비', '2': '상급침실 이용료', '3': '이미용비', '4': '기타 비급여' };
  const gradeName = grade => grade === 'cognitive' ? '인지지원등급' : `${grade}등급`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => Math.round(value).toLocaleString('ko-KR') + '원';
  const option = (value, label, current) => `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`;
  function readSession(key) { try { return JSON.parse(sessionStorage.getItem(key)) || {}; } catch { return {}; } }
  function saveSession(key, state) { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* 저장이 제한된 브라우저에서도 계산은 계속 제공 */ } }
  const defaults = service => ({ service, grade: '', burden: 'general', quantity: service === 'facility' ? 30 : 22, daycareBand: '8-10', minutes: 180, facilityKind: 'nursing', facilityEligible: false, example: false });
  function mount(host, options = {}) {
    if (!host || host.dataset.costMounted) return;
    host.dataset.costMounted = 'true';
    host.classList.add('care-cost');
    const institution = options.institution;
    const initialService = services[options.service] ? options.service : 'facility';
    let service = initialService;
    let state = { ...defaults(service), ...readSession(`careCost:v1:${service}`), service };
    let rows = [], loading = false, failed = false, loaded = false, serviceCode = '', requestVersion = 0;
    const context = root.CareCostEngine.resolveInstitutionContext({ service, facilityKind: state.facilityKind, serviceCodes: institution?.serviceCodes });
    const availableCodes = context.availableCodes;
    const institutionKey = () => `careCost:extras:v1:${institution?.id || 'manual'}:${service}:${serviceCode}`;
    let selections = {}, alternativesConfirmed = false;
    const restoreExtras = () => { const saved = readSession(institutionKey()); selections = saved.selections || {}; alternativesConfirmed = saved.alternativesConfirmed === true; };
    serviceCode = context.serviceCode;
    if (institution) state.facilityKind = context.facilityKind;
    restoreExtras();
    host.innerHTML = `<form class="cost-form" novalidate>
      <div class="cost-form-head"><span class="cost-eyebrow">2026년 공식 수가 기준</span><h2>한 달 돌봄비, 미리 가늠해 보세요</h2><p>${institution ? `${esc(institution.name)}의 일반 급여 기준으로 계산합니다.` : '장기요양등급과 이용량을 입력하면 예상 본인부담금을 확인할 수 있어요.'}</p></div>
      ${institution ? '' : `<label class="cost-field">이용할 돌봄<select name="service">${Object.entries(services).map(([value, label]) => option(value, label, service)).join('')}</select></label>`}
      <div class="cost-fields"><label class="cost-field">이용자의 장기요양등급<select name="grade">${option('', '모름 · 아직 확인하지 않았어요', state.grade)}${['1', '2', '3', '4', '5', 'cognitive'].map(value => option(value, gradeName(value), state.grade)).join('')}</select><small>기관 평가등급 A~E와 다른, 이용자 본인의 등급입니다.</small></label>
      <label class="cost-field">본인부담 유형<select name="burden">${Object.entries({ general: '일반', reduced40: '40% 감경', reduced60: '60% 감경', exempt: '면제' }).map(([value, label]) => option(value, label, state.burden)).join('')}</select><small>공단에서 확인된 감경·면제 자격을 선택해 주세요.</small></label></div>
      <div class="cost-usage"></div>
      <details class="cost-extras"><summary>식비 등 추가 비용 확인 <span>선택 항목만 합산</span></summary><div class="cost-extras-body"></div></details>
      <p class="cost-assumption">일반적인 단일 서비스, 방문요양은 1일 1회 기준입니다. 야간·휴일 가산, 가족요양, 치매전담 수가와 다른 서비스 병용은 별도 상담이 필요합니다.</p>
      <button class="cost-calculate" type="submit">월 예상 비용 확인</button>
    </form><div class="cost-result" aria-live="polite" aria-atomic="true"></div>
    <p class="cost-source">적용일 ${root.CareCostRates.effectiveFrom} · 확인일 ${root.CareCostRates.verifiedAt}<br><a href="${root.CareCostRates.source}" target="_blank" rel="noopener">공단 수가 고시</a> · <a href="${root.CareCostRates.burdenSource}" target="_blank" rel="noopener">본인부담 기준</a></p>`;
    const form = host.querySelector('form'), usage = host.querySelector('.cost-usage'), extras = host.querySelector('.cost-extras-body'), result = host.querySelector('.cost-result');
    const save = () => { saveSession(`careCost:v1:${service}`, state); saveSession(institutionKey(), { selections, alternativesConfirmed }); };
    function drawUsage() {
      let html = '';
      if (service === 'facility') {
        const allowed = institution && availableCodes.length ? availableCodes.map(code => code === 'A04' ? 'group' : 'nursing') : ['nursing', 'group'];
        if (!allowed.includes(state.facilityKind)) state.facilityKind = allowed[0];
        html += `<label class="cost-field">시설 유형<select name="facilityKind">${[...new Set(allowed)].map(value => option(value, value === 'group' ? '노인요양공동생활가정' : '노인요양시설(요양원)', state.facilityKind)).join('')}</select></label>`;
      }
      if (service === 'daycare') html += `<label class="cost-field">하루 이용시간<select name="daycareBand">${Object.entries(bands).map(([value, label]) => option(value, label, state.daycareBand)).join('')}</select></label>`;
      if (service === 'home-care') html += `<label class="cost-field">회당 이용시간<select name="minutes">${[30, 60, 90, 120, 150, 180, 210, 240].map(value => option(value, `${value}분`, state.minutes)).join('')}</select></label>`;
      html += `<label class="cost-field">월 ${service === 'home-care' ? '이용횟수 (1일 1회)' : '이용일수'}<div class="cost-number"><input name="quantity" type="number" inputmode="numeric" min="1" max="31" step="1" value="${esc(state.quantity)}"><span>${service === 'home-care' ? '회' : '일'}</span></div></label>`;
      usage.innerHTML = `<div class="cost-fields">${html}</div>${service === 'facility' && ['3', '4', '5'].includes(state.grade) ? `<label class="cost-check"><input name="facilityEligible" type="checkbox"${state.facilityEligible ? ' checked' : ''}>장기요양인정서에 시설급여가 포함되어 있어요</label>` : ''}`;
    }
    function drawExtras() {
      if (!institution) {
        extras.innerHTML = '<p>식비·상급침실료 등은 기관마다 다릅니다. 지도에서 기관을 선택하면 해당 기관·급여의 공개 비급여를 불러올 수 있어요.</p><label class="cost-field">직접 확인한 월 추가 비용<input name="manualExtra" type="number" min="0" max="10000000" inputmode="numeric" placeholder="확인한 금액만 원 단위로 입력" value="' + esc(selections.manual?.amount ?? '') + '"></label><label class="cost-check"><input name="manualConfirmed" type="checkbox"' + (selections.manual?.selected ? ' checked' : '') + '>한 달 전체 금액임을 확인하고 포함할게요</label>';
        return;
      }
      const selector = availableCodes.length > 1 ? `<label class="cost-field">비급여를 확인할 급여<select name="serviceCode">${availableCodes.map(code => option(code, code === 'A04' ? '공동생활가정 (A04)' : `${services[service]} (${code})`, serviceCode)).join('')}</select></label>` : '';
      if (loading) { extras.innerHTML = selector + '<p role="status">선택한 급여의 공개 비급여를 확인하고 있어요.</p>'; return; }
      if (failed || !loaded || !rows.length) { extras.innerHTML = selector + '<p>기관 확인 필요 · 이 급여의 비급여 금액을 확인할 수 없습니다. 미공개는 무료를 뜻하지 않으며, 식비 등은 아래 예상 합계에 포함되지 않습니다.</p>'; return; }
      extras.innerHTML = selector + '<p>공개 금액의 적용 단위와 월 횟수를 확인한 항목만 선택하세요. 다른 가격대의 방 등 서로 대체하는 요금은 함께 선택하지 마세요.</p>' + rows.map((row, index) => {
        const selected = selections[row.key] || {};
        return `<fieldset class="cost-extra-row" data-row="${index}"><legend>${esc(kinds[row.kind] || '공개 비급여')}</legend><p>${esc(row.basis || '산출 근거 미공개')}</p><strong>${row.amount === null ? '금액 기관 확인 필요' : money(row.amount)}</strong><small>자료 수정일 ${esc(row.updatedDate || '미확인')}</small>${row.amount === null ? '' : `<div class="cost-fields"><label class="cost-field">공개 금액의 단위<select name="extraUnit:${index}">${option('', '단위 확인 필요', selected.unit)}${Object.entries({ meal: '1식당', day: '1일당', month: '1개월당', visit: '1회당' }).map(([value, label]) => option(value, label, selected.unit)).join('')}</select></label><label class="cost-field">한 달 적용 횟수<input name="extraQuantity:${index}" type="number" min="1" max="999" step="1" value="${esc(selected.quantity ?? 1)}"></label></div><label class="cost-check"><input name="extraSelected:${index}" type="checkbox"${selected.selected ? ' checked' : ''}>단위·횟수를 확인했고 이 항목을 포함할게요</label>`}</fieldset>`;
      }).join('') + `<label class="cost-check"><input name="alternativesConfirmed" type="checkbox"${alternativesConfirmed ? ' checked' : ''}>같은 종류를 여러 개 선택했다면 서로 중복되는 요금이 아님을 확인했어요</label>`;
    }
    async function loadExtras() {
      if (!institution) { drawExtras(); return; }
      const version = ++requestVersion;
      rows = []; loaded = false; failed = false;
      if (!serviceCode || !root.NhisStaticData) { failed = true; drawExtras(); updateResult(); return; }
      loading = true; drawExtras();
      try {
        const response = await root.NhisStaticData.detail(institution.id, serviceCode);
        if (version !== requestVersion) return;
        const detail = response.document?.serviceDetails?.[serviceCode];
        loaded = !!detail && detail.availableSections?.includes('nonCovered');
        rows = root.CareCostEngine.normalizeNonCovered(detail?.sections?.nonCovered);
      } catch { if (version !== requestVersion) return; failed = true; }
      if (version !== requestVersion) return;
      loading = false; drawExtras(); updateResult();
    }
    function updateResult() {
      if (institution && !availableCodes.length) {
        result.innerHTML = '<h3>이 급여는 기관별 비용 확인이 필요해요</h3><p>치매전담형 등 별도 수가는 이 일반 계산에 적용하지 않습니다.</p><a href="care-cost.html">일반 급여 비용 안내 보기</a>';
        return;
      }
      const nonCovered = institution ? rows.map(row => ({ ...row, ...selections[row.key], confirmed: selections[row.key]?.selected === true })) : selections.manual?.selected ? [{ kind: 'manual', basis: '직접 확인한 월 추가 비용', unit: 'month', quantity: 1, confirmed: true, ...selections.manual }] : [];
      const calculated = root.CareCostEngine.calculate({ ...state, nonCovered, alternativesConfirmed });
      if (calculated.status === 'grade-required') {
        result.innerHTML = '<h3>장기요양등급을 아직 모르시나요?</h3><p>공단에 장기요양인정을 신청하거나 인정서의 등급을 확인해 주세요. 장애 정도로 장기요양등급을 추정하지 않습니다.</p><div class="cost-help-actions"><button type="button" data-cost-example>3등급 예시로 계산해 보기</button><a href="https://www.longtermcare.or.kr/" target="_blank" rel="noopener">공단 신청·등급 확인 안내</a><a href="tel:15771000">공단 1577-1000</a></div>';
        return;
      }
      if (!calculated.low) { result.innerHTML = `<h3>이용 조건을 확인해 주세요</h3>${calculated.issues.map(issue => `<p>${esc(issue)}</p>`).join('')}`; return; }
      const range = key => calculated.isRange && calculated.low[key] !== calculated.high[key] ? `${money(calculated.low[key])} ~ ${money(calculated.high[key])}` : money(calculated.low[key]);
      const unknown = calculated.unknown.length || (institution && (loading || !loaded || !rows.length || rows.some(row => row.amount === null || !selections[row.key]?.selected))) || !nonCovered.some(row => row.selected);
      result.innerHTML = `<p class="cost-eyebrow">${state.example ? '직접 선택한 3등급 예시 · ' : ''}월 예상 ${calculated.status === 'needs-confirmation' ? '확인된 항목 소계' : '본인부담'}</p><p class="cost-total">${range('total')}</p>
        <p class="cost-conditions">2026년 · ${esc(service === 'facility' ? state.facilityKind === 'group' ? '노인요양공동생활가정' : '노인요양시설(요양원)' : services[service])} · ${gradeName(state.grade)} · ${state.quantity}${service === 'home-care' ? `회 × ${state.minutes}분` : `일${service === 'daycare' ? ` × ${bands[state.daycareBand]}` : ''}`} · 급여 본인부담 ${calculated.percent}%${state.example && service === 'facility' ? ' · 시설급여 인정 가정' : ''}</p>
        <dl class="cost-breakdown"><div><dt>급여 본인부담</dt><dd>${range('copay')}</dd></div><div><dt>월 한도 초과분 <small>전액 본인부담</small></dt><dd>${range('excess')}</dd></div><div><dt>선택한 비급여</dt><dd>${range('nonCovered')}</dd></div></dl>
        ${calculated.cap !== null ? `<p>적용 월 한도 <strong>${money(calculated.cap)}</strong>${calculated.extensionPercent ? ` · 주야간보호 월 15일 이상, 하루 8시간 이상 이용으로 ${calculated.extensionPercent}% 추가 적용(기본 ${money(calculated.baseCap)})` : ''}</p>` : ''}
        <details class="cost-formula"><summary>계산 근거 보기</summary><p>공식 1일/회 수가 ${range('unitRate')} × ${state.quantity} = 급여 총액 ${range('benefitTotal')}</p><p>한도 내 급여액 × ${calculated.percent}% + 한도 초과 전액 + 선택한 비급여. 예산 비교를 위해 원 단위로 반올림합니다. 실제 청구의 단수 처리·개인별 가감액에 따라 달라질 수 있습니다.</p></details>
        ${calculated.notes.map(note => `<p class="cost-note">${esc(note)}</p>`).join('')}
        ${unknown ? '<p class="cost-note">기관 확인 필요 · 미선택·미공개 비급여는 합계에 포함되지 않습니다. 실제 월 납부액은 기관에 확인해 주세요.</p>' : ''}
        ${calculated.unknown.map(item => `<p class="cost-error">확인 필요: ${esc(item)}</p>`).join('')}`;
    }
    form.addEventListener('submit', event => { event.preventDefault(); save(); updateResult(); result.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    function updateInput(event) {
      const field = event.target, name = field.name;
      if (name === 'service') {
        save(); service = field.value; state = { ...defaults(service), ...readSession(`careCost:v1:${service}`), service };
        form.elements.grade.value = state.grade; form.elements.burden.value = state.burden; restoreExtras(); drawUsage(); drawExtras();
      } else if (name === 'serviceCode') { serviceCode = field.value; if (service === 'facility') state.facilityKind = serviceCode === 'A04' ? 'group' : 'nursing'; restoreExtras(); drawUsage(); loadExtras(); }
      else if (name?.startsWith('extra')) {
        const [kind, index] = name.split(':'), row = rows[Number(index)];
        if (!row) return;
        const selected = selections[row.key] ||= { quantity: 1, unit: '', selected: false };
        if (kind === 'extraUnit') selected.unit = field.value;
        if (kind === 'extraQuantity') selected.quantity = Number(field.value);
        if (kind === 'extraSelected') selected.selected = field.checked;
      } else if (name === 'alternativesConfirmed') alternativesConfirmed = field.checked;
      else if (name === 'manualExtra' || name === 'manualConfirmed') {
        selections.manual ||= { amount: null, selected: false };
        if (name === 'manualExtra') selections.manual.amount = field.value === '' ? null : Number(field.value);
        else selections.manual.selected = field.checked;
      } else if (['grade', 'burden', 'quantity', 'daycareBand', 'minutes', 'facilityKind', 'facilityEligible'].includes(name)) {
        state[name] = name === 'facilityEligible' ? field.checked : ['quantity', 'minutes'].includes(name) ? Number(field.value) : field.value;
        if (name === 'grade') { state.example = false; state.facilityEligible = false; drawUsage(); }
        if (name === 'facilityKind' && institution) { serviceCode = availableCodes.find(code => (code === 'A04') === (state.facilityKind === 'group')) || ''; restoreExtras(); loadExtras(); }
      }
      save(); updateResult();
    }
    form.addEventListener('change', updateInput);
    form.addEventListener('input', event => { if (event.target.matches('input[type="number"]')) updateInput(event); });
    host.addEventListener('click', event => {
      if (!event.target.closest('[data-cost-example]')) return;
      state = { ...defaults(service), grade: '3', example: true, facilityEligible: service === 'facility', facilityKind: state.facilityKind };
      form.elements.grade.value = '3'; form.elements.burden.value = 'general'; drawUsage(); save(); updateResult();
    });
    drawUsage(); drawExtras(); updateResult(); loadExtras();
    return { refresh: updateResult };
  }
  root.CareCostUI = { mount };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-care-cost-page]').forEach(host => {
      const service = new URLSearchParams(location.search).get('service');
      mount(host, { service: services[service] ? service : 'facility' });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
/** SOFTM-CARE-COST-UI END */
