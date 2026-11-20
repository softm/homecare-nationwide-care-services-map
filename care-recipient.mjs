/** SOFTM-GUARDIAN START 날짜:20261120 : 간편가입 후 보호자 연락처와 별도 동의한 대상자 정보를 연결 */
import {api,refreshSession,currentSession} from './care-member-api.mjs';
import {RELATIONSHIPS,SEXES,MOBILITY,CARE_NEEDS,recipientSummary} from './care-recipient-model.mjs';
import {escapeHtml as esc} from './care-photos-common.js';
export async function recipientContext() {
    const session=await refreshSession();
    if(!session?.user || session.user.kind!=='personal' || session.user.onboarding!=='complete')return null;
    const data=await api('/api/me/care-recipient');
    if(currentSession()?.user?.id!==session.user.id || data.guardian.userId!==session.user.id)return null;
    return data;
}
const options=(values,selected)=>Object.entries(values).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${label}</option>`).join('');
export async function mountRecipientEditor(host) {
    if(!host)return;
    host.innerHTML='<h2>돌봄 대상자 정보</h2><p role="status">저장한 정보를 확인하고 있어요.</p>';
    let data;
    try{data=await recipientContext();}catch(e){host.innerHTML=`<h2>돌봄 대상자 정보</h2><p role="alert">${esc(e.message)}</p><button type="button">다시 불러오기</button>`;host.querySelector('button').onclick=()=>mountRecipientEditor(host);return;}
    if(!data){host.hidden=true;return;}
    const profile=data.profile||{},guardian=data.guardian;
    host.innerHTML=`<span class="hc-pill">보호자와 돌봄 대상자를 따로 관리해요</span><h2 style="margin-top:12px">누구에게 돌봄이 필요한가요?</h2><p>관계·성별·돌봄 상태를 바탕으로 시설에서 확인할 조건과 질문을 준비합니다.</p><div class="hc-note"><strong>연락받을 보호자: ${esc(guardian.name||'이름 미입력')}</strong><p>${esc(guardian.phone||'휴대폰 번호 미입력')}</p><a href="#profileForm">보호자 이름·휴대폰 수정</a><p class="hc-help">상담 회신·이용 안내의 연락 대상은 가입한 회원입니다. 대상자의 전화번호는 받지 않습니다.</p></div><form class="hc-form" style="margin-top:20px" id="careRecipientForm"><div class="hc-two"><label>대상자는 회원님과 어떤 관계인가요?<select name="relationship" required><option value="">관계 선택</option>${options(RELATIONSHIPS,profile.relationship)}</select></label><label>대상자 성별<select name="sex">${options(SEXES,profile.sex||'unspecified')}</select></label></div><label>대상자의 이동 상태<select name="mobility">${options(MOBILITY,profile.mobility||'unspecified')}</select></label><fieldset class="hc-note hc-care-needs"><legend>필요한 돌봄 (복수 선택)</legend>${Object.entries(CARE_NEEDS).map(([key,label])=>`<label class="check"><input type="checkbox" name="careNeeds" value="${key}" ${profile.careNeeds?.includes(key)?'checked':''}>${label}</label>`).join('')}</fieldset><label>대상자 정보 입력 동의 확인<select name="authority" required></select></label><div class="hc-note"><strong>돌봄 상태 수집·이용 안내</strong><p class="hc-help">수집 항목: 관계·성별·이동 상태·필요한 돌봄·동의 확인. 목적: 맞춤 조건과 상담 질문 준비. 대상자 정보 삭제 또는 회원 탈퇴 시까지 보관합니다. 동의하지 않아도 가입과 일반 검색을 이용할 수 있습니다.</p><label class="check"><input type="checkbox" name="healthConsent" required><span>대상자 본인 또는 법정대리인의 동의를 확인했으며, 돌봄 상태의 수집·이용에 별도로 동의합니다.</span></label><p class="hc-help">가족이라는 이유만으로 법정대리 권한이 생기지는 않습니다. 가족 공유와 기관에 이 정보를 자동 제공하지 않습니다. <a href="privacy.html#care-recipient">자세한 안내</a></p></div><p role="status" class="hc-status"></p><div class="hc-actions"><button>대상자 정보 저장</button>${data.profile?'<button type="button" id="deleteRecipient" class="danger">대상자 정보 삭제</button>':''}<a href="care-analysis.html">맞춤 찾기로 이동 →</a></div></form>`;
    const form=host.querySelector('form'),status=form.querySelector('[role=status]');
    const updateAuthority=()=>{const self=form.elements.relationship.value==='self';form.elements.authority.innerHTML=`<option value="">동의 확인 방법 선택</option>`+options(self?{self:'대상자 본인입니다'}:{'subject-consent':'대상자 본인의 동의를 받았습니다','legal-representative':'대상자의 법정대리인입니다'},profile.authority);};
    form.elements.relationship.onchange=updateAuthority;updateAuthority();
    form.onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;status.textContent='저장하고 있어요.';status.dataset.error='false';try{const values=new FormData(form);data=await api('/api/me/care-recipient',{method:'PUT',headers:{'If-Match':String(data.revision)},body:{...Object.fromEntries(values),careNeeds:values.getAll('careNeeds'),healthConsent:values.get('healthConsent')==='on'}});await mountRecipientEditor(host);host.querySelector('[role=status]').textContent='저장했습니다. 맞춤 찾기에서 대상자 조건을 적용할 수 있어요.';}catch(e){status.textContent=e.message;status.dataset.error='true';}finally{button.disabled=false;}};
    host.querySelector('#deleteRecipient')?.addEventListener('click',async event=>{if(!confirm('관계·성별·돌봄 상태와 해당 동의 기록을 삭제할까요? 보호자 계정과 기존 상담 기록은 유지됩니다.'))return;event.target.disabled=true;try{await api('/api/me/care-recipient',{method:'DELETE',headers:{'If-Match':String(data.revision)}});await mountRecipientEditor(host);host.querySelector('[role=status]').textContent='대상자 정보를 삭제했습니다.';}catch(e){status.textContent=e.message;status.dataset.error='true';event.target.disabled=false;}});
}
export async function mountGuardianContact(host) {
    if(!host)return;
    try{const context=await recipientContext();if(!context){host.hidden=true;return;}const guardian=context.guardian;host.innerHTML=`<h2>연락받을 보호자</h2><strong>${esc(guardian.name||'이름을 입력해 주세요')}</strong><p>${esc(guardian.phone||'휴대폰 번호를 입력해 주세요')}</p><p class="hc-help">상담 회신과 이용 안내의 연락 대상입니다. 이 화면에서 기관에 메시지가 발송되지는 않습니다.</p><a href="care-account.html#profileForm">보호자 연락처 관리 →</a>`;}catch(e){host.innerHTML=`<h2>보호자 연락처</h2><p role="status">${esc(e.message)}</p><a href="care-account.html">내 정보에서 확인 →</a>`;}
}
export {recipientSummary};
/** SOFTM-GUARDIAN END */
