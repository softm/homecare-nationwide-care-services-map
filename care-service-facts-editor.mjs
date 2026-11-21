/** SOFTM-KEY START 날짜:20261121 : 초안 저장과 실제 확인 게시를 분리하는 기관·운영자 공용 편집기 */
import {api} from './care-member-api.mjs';
import {FACT_KEYS,FACT_LABELS,DAYS,cleanFact,emptyValue} from './care-service-facts-model.mjs';
import {itemHTML} from './care-service-facts.mjs?v=20261121-facts1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const money=(name,label,value)=>`<label>${label}<input name="${name}" type="number" min="0" max="10000000" step="1" value="${value??''}" placeholder="미확인"><small>미확인은 빈칸, 비용이 없으면 0원</small></label>`;
function fields(key,v){
 if(key==='schedule')return `<p>이용 가능한 요일을 선택하고 운영시간을 입력하세요.</p>${DAYS.map((day,i)=>{const d=v.days.find(d=>d.day===i+1);return `<div class="sf-day"><label class="sf-check"><input type="checkbox" name="day-${i+1}" ${d?'checked':''}>${day}</label><input aria-label="${day}요일 시작" name="start-${i+1}" type="time" value="${d?.start||'09:00'}"><input aria-label="${day}요일 종료" name="end-${i+1}" type="time" value="${d?.end||'18:00'}"></div>`;}).join('')}`;
 if(key==='availability')return `<p>현재 요일별 상담 가능 인원입니다. 등록 정원과 구분해 주세요.</p>${DAYS.map((day,i)=>{const d=v.days.find(d=>d.day===i+1);return `<div class="sf-day"><span>${day}</span><select aria-label="${day}요일 자리 상태" name="state-${i+1}">${Object.entries({unknown:'미확인',available:'상담 가능',waiting:'대기 접수',unavailable:'이용 불가'}).map(([k,l])=>`<option value="${k}" ${d?.state===k?'selected':''}>${l}</option>`).join('')}</select><input type="number" min="0" max="1000" step="1" name="count-${i+1}" aria-label="${day}요일 가능 인원" placeholder="인원 미확인" value="${d?.count??''}"></div>`;}).join('')}`;
 if(key==='shuttle')return `<label>송영 가능 지역<textarea name="areas" maxlength="500" placeholder="예: 상동·중동 일부, 담당자에게 자택 위치 확인">${esc(v.areas)}</textarea></label><label>차량 이용·픽업 조건<textarea name="shuttleConditions" maxlength="500" placeholder="예: 휠체어 탑승 가능 여부, 아파트 출입구 픽업">${esc(v.conditions)}</textarea></label>`;
 if(key==='fees')return `<div class="sf-fields">${money('mealPerDay','식비 · 하루 원',v.mealPerDay)}${money('snackPerDay','간식비 · 하루 원',v.snackPerDay)}${money('otherMonthly','기타 비급여 · 월 합계 원',v.otherMonthly)}</div><label class="sf-check"><input type="checkbox" name="complete" ${v.complete?'checked':''}>위 금액에 해당 이용 조건의 비급여 항목이 모두 포함되어 있습니다.</label><p>횟수별·선택형 비용은 아래 적용 조건에 적으세요. 합계가 달라질 수 있으면 전체 포함을 선택하지 마세요.</p>`;
 return `<label>대응할 수 있는 돌봄과 제한 조건<textarea name="details" maxlength="1000" placeholder="확인한 보행·식사·인지 지원 범위와 사전 상담이 필요한 조건">${esc(v.details)}</textarea></label><p>자격·공개 인력 수만으로 실제 대응 가능 여부를 추정하지 않습니다.</p>`;
}
function readItem(card,item){const f=new FormData();card.querySelectorAll('input,textarea,select').forEach(el=>{if(el.type!=='checkbox'||el.checked)f.set(el.name,el.type==='checkbox'?'on':el.value);});const get=n=>f.get(n)||'',num=n=>get(n)===''?null:Number(get(n)),key=card.dataset.factEdit;let value;
 if(key==='schedule')value={days:DAYS.flatMap((_,i)=>get(`day-${i+1}`)?[{day:i+1,start:get(`start-${i+1}`),end:get(`end-${i+1}`)}]:[])};
 else if(key==='availability')value={days:DAYS.map((_,i)=>({day:i+1,state:get(`state-${i+1}`),count:num(`count-${i+1}`)}))};
 else if(key==='fees')value={mealPerDay:num('mealPerDay'),snackPerDay:num('snackPerDay'),otherMonthly:num('otherMonthly'),complete:get('complete')==='on'};
 else if(key==='shuttle')value={areas:get('areas'),conditions:get('shuttleConditions')};else value={details:get('details')};
 return {key,revision:item.revision,...cleanFact(key,{value,conditions:get('conditions')})};
}
export async function mountFactsEditor(host,id,{operator=false,readOnly=false}={}){
 let data,dirty=false;const path=`/api/${operator?'admin/':''}institutions/${id}/service-facts`;
 const status=(message,error=false)=>{const el=host.querySelector('[role=status]');if(el){el.textContent=message;el.dataset.error=String(error);}};
 const run=async(fn,button)=>{if(button)button.disabled=true;try{await fn();}catch(e){status(e.message,true);}finally{if(button?.isConnected)button.disabled=false;}};
 async function load(){data=await api(path);draw();}
 function draw(){dirty=false;host.innerHTML=`<section class="sf-panel"><h2>이번 주 이용정보</h2><p>① 항목 입력·초안 저장 → ② 직접 확인한 항목 선택 → ③ 확인하고 공개</p><p>소개글·사진 수정으로 확인일이 갱신되지 않습니다. 확인한 항목은 7일이 지나면 ‘재확인 필요’로 표시합니다.</p><div class="sf-actions"><button type="button" data-reload class="secondary">다시 불러오기</button></div></section><p class="sf-status" role="status"></p>${!data.pilot?.enabled?'<p class="sf-call-note">최신 이용정보 시범운영에 아직 참여하지 않았거나 참여가 중단되었습니다. 운영자가 담당자와 참여를 확인하면 입력할 수 있습니다.</p>':`<form class="sf-editor">${FACT_KEYS.map(key=>{const item=data.items[key],draft=item?.draft||{value:emptyValue(key),conditions:''};return `<fieldset data-fact-edit="${key}" ${readOnly?'disabled':''}><legend>${FACT_LABELS[key]}</legend><label class="sf-check"><input type="checkbox" name="confirm-${key}" data-confirm-key="${key}">이 항목을 실제 확인했습니다</label><details ${item?.live?'':'open'}><summary>내용 입력·수정</summary>${fields(key,draft.value)}<label>적용 조건·예외<textarea name="conditions" maxlength="500">${esc(draft.conditions)}</textarea></label></details><details><summary>현재 공개된 정보</summary>${itemHTML(key,item?.live)}</details></fieldset>`;}).join('')}${operator?'<label>통화 확인 근거 (필수)<textarea name="reason" required maxlength="500" placeholder="담당 부서·확인한 범위만 기록, 환자 이름·전화번호는 입력하지 마세요."></textarea></label><label>이번 확인에 쓴 운영 지원 시간 · 분<input type="number" name="supportMinutes" min="0" max="240" value="0" required></label>':''}<div class="sf-actions"><button type="submit" name="action" value="draft" class="secondary" ${readOnly?'disabled':''}>입력 내용 초안 저장</button><button type="button" data-publish ${readOnly?'disabled':''}>선택 항목 확인·공개</button></div><p>변경이 없으면 해당 항목만 선택하고 다시 확인할 수 있습니다. 선택하지 않은 항목의 확인일은 유지됩니다.</p></form>`}<details class="sf-panel"><summary>최근 변경 이력</summary>${data.audit.map(a=>`<p>${esc(FACT_LABELS[a.item_key]||'시범운영')} · ${esc({draft:'초안 저장',confirm:'확인 게시',enroll:'참여',pause:'중단'}[a.action])} · ${new Date(a.occurred_at*1000).toLocaleString('ko-KR')} ${esc(a.reason)}</p>`).join('')||'<p>아직 변경 이력이 없습니다.</p>'}</details>`;
 host.querySelector('[data-reload]').onclick=e=>run(async()=>{if(dirty&&!confirm('저장하지 않은 입력을 버리고 새로 불러올까요?'))return;await load();},e.currentTarget);
 const form=host.querySelector('form');if(!form)return;
 form.addEventListener('input',e=>{if(e.target.closest('[data-fact-edit]')&&!e.target.matches('[data-confirm-key]')){dirty=true;status('입력을 수정했습니다. 먼저 초안 저장을 눌러 주세요.');}});
 const mutate=async(action,button)=>run(async()=>{
  if(readOnly)return;if(action==='confirm'&&dirty)throw Error('수정한 내용을 먼저 초안 저장한 뒤 확인해 주세요.');
  const keys=action==='draft'?FACT_KEYS:[...form.querySelectorAll('[data-confirm-key]:checked')].map(el=>el.dataset.confirmKey);if(!keys.length)throw Error('실제로 확인한 항목을 하나 이상 선택해 주세요.');
  const items=keys.map(key=>action==='draft'?readItem(form.querySelector(`[data-fact-edit="${key}"]`),data.items[key]):{key,revision:data.items[key].revision});
  const reason=form.elements.reason?.value||'',supportMinutes=Number(form.elements.supportMinutes?.value||0);
  if(operator&&!reason.trim())throw Error('통화 확인 근거를 입력해 주세요.');
  if(action==='confirm'&&!confirm(`${keys.map(k=>FACT_LABELS[k]).join(', ')} 항목을 지금 확인한 정보로 공개할까요?`))return;
  data=await api(path,{method:'PUT',body:{action,items,reason,supportMinutes}});draw();status(action==='draft'?'초안을 저장했습니다. 확인할 항목을 선택해 공개해 주세요.':'선택한 항목만 확인일을 갱신해 공개했습니다.');
 },button);
 form.onsubmit=e=>{e.preventDefault();void mutate('draft',e.submitter);};form.querySelector('[data-publish]').onclick=e=>mutate('confirm',e.currentTarget);
 }
 host.innerHTML='<p class="sf-status" role="status">이번 주 이용정보를 불러오고 있습니다.</p>';await run(load);
}
/** SOFTM-KEY END */
