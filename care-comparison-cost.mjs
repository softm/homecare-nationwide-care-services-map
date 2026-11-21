import {loadFacts,hydrateFacts,dateFact} from './care-service-facts.mjs?v=20261121-facts1';
import {monthlyFees} from './care-service-facts-model.mjs'; // SOFTM-KEY 날짜:20261121 : 확인된 비급여만 공통 이용일수로 계산
/** SOFTM-PERSONAL-COST START 날짜:20261121 : 같은 이용 조건과 공식 수가로 비교하며 미확인 비급여·계정 변경을 구분 */
import './care-cost-rates.js?v=20261121-personal-cost1';
import './care-cost-engine.js?v=20260904-1';
import {CARE_GRADES,CARE_BURDENS} from './care-recipient-model.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const won=value=>`${value.toLocaleString('ko-KR')}원`;
const supported=new Set(['facility','daycare','home-care']);
const states=new Map(),mounted=new Set();
let owner,epoch=0;
const initial=type=>({grade:'',burden:'',quantity:type==='facility'?30:22,daycareBand:'8-10',minutes:180,facilityEligible:false,exception:false,extras:{},touched:false,profileLoaded:false});
const choices=(values,current)=>Object.entries(values).map(([key,label])=>`<option value="${key}" ${String(current)===key?'selected':''}>${esc(label)}</option>`).join('');
const bands={'3-6':'3시간 이상 ~ 6시간 미만','6-8':'6시간 이상 ~ 8시간 미만','8-10':'8시간 이상 ~ 10시간 미만','10-13':'10시간 이상 ~ 13시간 이하','13-plus':'13시간 초과'};

export function estimate(type,row,state){
    const fail=(value,note)=>({value,note,tone:'verify'});
    if(!supported.has(type))return fail('별도 견적 필요',type==='nursing-hospital'?'요양병원은 건강보험 진료비·간병비로 계산합니다.':'이 유형은 별도 급여 기준·이용 조건 확인이 필요합니다.');
    const context=globalThis.CareCostEngine.resolveInstitutionContext({service:type,serviceCodes:row.t||[]});
    if(!context.availableCodes.length)return fail('급여 유형 확인 필요','일반 수가를 적용할 수 없는 치매전담형 등은 기관에 확인해 주세요.');
    if(type==='facility'&&context.availableCodes.includes('A04')&&context.availableCodes.some(code=>code!=='A04'))return fail('시설 유형 확인 필요','공동생활가정과 요양원 중 실제 이용할 급여를 확인해 주세요.');
    if(!state.grade)return fail('등급 입력 후 계산','위에서 대상자의 장기요양등급을 선택해 주세요.');
    if(!state.burden)return fail('본인부담 유형 선택','일반·감경·면제 여부를 선택해 주세요.');
    const result=globalThis.CareCostEngine.calculate({...state,service:type,facilityKind:context.facilityKind,quantity:Number(state.quantity),specialCare:state.exception});
    if(!result.low)return fail('이용 조건 확인 필요',result.issues.join(' '));
    const manual=state.extras?.[row.i],provided=type==='daycare'?monthlyFees(state.serviceFacts?.[row.i]?.facts?.fees,Number(state.quantity)):{total:null},auto=manual===undefined||manual==='';
    const raw=auto?provided.total:manual,hasExtra=raw!==''&&raw!==undefined&&raw!==null;
    const extra=hasExtra?Number(raw):0;
    if(hasExtra&&(!Number.isSafeInteger(extra)||extra<0||extra>100000000))return fail('비급여 금액 확인','월 비급여는 0~100,000,000원의 정수로 입력해 주세요.');
    const low=result.low.total+extra,high=result.high.total+extra;
    const range=(a,b)=>a===b?won(a):`${won(a)} ~ ${won(b)}`;
    const description=[`${CARE_GRADES[state.grade]} · 본인부담 ${result.percent}% · 월 ${state.quantity}일`,type==='daycare'?`하루 ${bands[state.daycareBand]}`:type==='home-care'?`1일 1회 · 회당 ${state.minutes}분`:'',`급여 본인부담 ${range(result.low.copay,result.high.copay)}`,result.low.excess?`한도 초과 전액부담 ${won(result.low.excess)}`:'',hasExtra?`${auto?'기관 확인':'입력한'} 월 비급여 ${won(extra)} 포함${auto?' · '+provided.reason+' · 확인 '+dateFact(state.serviceFacts[row.i].facts.fees.confirmedAt):''}`:`식비 등 비급여 미포함 · ${provided.reason||'추가 확인 필요'}`,...result.notes].filter(Boolean);
    return {value:`${hasExtra?'약 ':'급여 기준 약 '}${range(low,high)}`,note:description.join(' / '),tone:'confirmed',result,low,high,hasExtra};
}

function panel(type,state){
    return `<section class="care-compare-cost" aria-label="월 예상 본인부담금 계산 조건"><div class="care-cost-heading"><div><span>우리 가족 비용 예측</span><h3>월 예상 본인부담금</h3><p>같은 조건으로 나란히 계산합니다. 이용 예정 일수·시간을 확인해 주세요.</p></div><a href="care-account.html#careRecipient">등급을 내 정보에 저장 →</a></div><p class="care-cost-profile" role="status"></p><div class="care-compare-cost-fields"><label>대상자 장기요양등급<select name="grade">${choices(CARE_GRADES,state.grade)}</select></label><label>본인부담 유형<select name="burden">${choices(CARE_BURDENS,state.burden)}</select></label><label>월 이용 일수<input name="quantity" type="number" min="1" max="31" step="1" value="${state.quantity}" inputmode="numeric"></label>${type==='daycare'?`<label>하루 이용시간<select name="daycareBand">${choices(bands,state.daycareBand)}</select></label>`:type==='home-care'?`<label>1회 이용시간<select name="minutes">${choices(Object.fromEntries(Object.keys(CareCostRates.homeCare).map(n=>[n,`${n}분`])),state.minutes)}</select></label>`:''}</div>${type==='facility'?`<label class="care-cost-check" data-facility-eligibility><input name="facilityEligible" type="checkbox" ${state.facilityEligible?'checked':''}><span>장기요양인정서에 <strong>시설급여 이용 가능</strong>이 표시되어 있어요. (3~5등급)</span></label>`:''}<details class="care-cost-exceptions"><summary>일반 계산에 포함되지 않는 이용 조건 확인</summary><label class="care-cost-check"><input name="exception" type="checkbox" ${state.exception?'checked':''}><span>치매전담 수가·가족요양·다른 재가급여 병용·야간/휴일 가산 중 해당 항목이 있어요.</span></label><p>해당하는 경우 기관의 별도 계산이 필요합니다. 방문요양은 1일 1회 기준입니다.</p></details><p class="care-cost-basis">${CareCostRates.year}년 공단 수가 · 확인 ${CareCostRates.verifiedAt} · <a href="${esc(CareCostRates.source)}" target="_blank" rel="noopener">산출 기준</a><br>한도 내 급여비 × 본인부담률 + 월 한도 초과액 + 입력한 비급여. 비급여가 비어 있으면 급여 기준 예상액만 표시합니다. 요양원은 적용 수가에 따른 범위로 표시합니다. 원 단위 반올림한 예상액으로, 청구 시 단수 처리·진찰료 등 추가 비용은 별도 확인해 주세요.</p><p class="care-cost-announcement" aria-live="polite"></p></section>`;
}

export async function mount(host,{type,rows}){
    const workspace=host.querySelector('.care-compare-workspace');
    if(!workspace||!rows.length)return;
    for(const item of mounted)if(!item.workspace.isConnected||item.workspace===workspace)mounted.delete(item);
    let state=states.get(type)||initial(type);states.set(type,state);
    workspace.querySelector('[data-cost-controls]')?.remove();
    const container=document.createElement('div');container.dataset.costControls='';workspace.querySelector('.care-compare-layout').after(container); // SOFTM-COMPARE-CORE-FIRST 날짜:20261122 : 핵심 비교 내용을 먼저 읽은 뒤 개인 비용 조건을 입력
    const cells=[...workspace.querySelectorAll('[data-cost-index]')];
    let status='로그인한 보호자의 저장 정보를 확인하고 있어요.',timer;
    const update=()=>{
        cells.forEach((cell,index)=>{
            const row=rows[index];if(!row)return;
            const value=estimate(type,row,state);cell.dataset.tone=value.tone;const input=cell.querySelector('.care-cost-extra input');if(input)input.placeholder=type==='daycare'&&monthlyFees(state.serviceFacts?.[row.i]?.facts?.fees,Number(state.quantity)).total!==null?'기관 확인액 자동 적용':'미확인';
            cell.querySelector('strong').textContent=value.value;cell.querySelector('span').textContent=value.note;
        });
        const eligible=container.querySelector('[data-facility-eligibility]');if(eligible)eligible.hidden=!['3','4','5'].includes(state.grade);
        const message=container.querySelector('.care-cost-profile');if(message)message.textContent=status;
    };
    const draw=()=>{
        container.innerHTML=supported.has(type)?panel(type,state):'';
        cells.forEach((cell,index)=>{
            cell.querySelector('.care-cost-extra')?.remove();
            if(!supported.has(type))return;
            const label=document.createElement('label');label.className='care-cost-extra';label.innerHTML=`직접 확인한 월 비급여 (선택)<input type="number" inputmode="numeric" min="0" max="100000000" step="1" placeholder="미확인" aria-label="${esc(rows[index].n)} 월 비급여 금액" value="${esc(state.extras[rows[index].i]??'')}"><small>월 합계 · 원 / 입력하면 기관 제공 금액 대신 적용</small>`;cell.append(label);
            label.querySelector('input').addEventListener('input',event=>{state.touched=true;state.extras[rows[index].i]=event.target.value;update();announce();});
        });
        container.addEventListener('input',onInput,{signal:controller.signal});
        update();
    };
    const announce=()=>{clearTimeout(timer);timer=setTimeout(()=>{const target=container.querySelector('.care-cost-announcement');if(target)target.textContent='입력한 조건으로 아래 비교표의 예상 금액을 갱신했습니다.';},350);};
    const onInput=event=>{
        const input=event.target;if(!['grade','burden','quantity','minutes','daycareBand','facilityEligible','exception'].includes(input.name))return;
        state[input.name]=input.type==='checkbox'?input.checked:input.value;state.touched=true;
        status='이 화면에서 조정한 조건입니다. 회원정보는 변경하지 않습니다.';update();announce();
    };
    const controller=new AbortController();
    const reset=()=>{state=initial(type);states.set(type,state);status='계정이 변경되어 이전 계산 조건을 지웠어요. 등급을 선택해 주세요.';draw();};
    const item={workspace,reset};mounted.add(item);draw();
    // SOFTM-KEY 날짜:20261121 : 비급여 조회 실패는 급여 계산과 기존 수동 입력을 막지 않음
    if(type==='daycare'){const currentEpoch=epoch;void Promise.all(rows.map(row=>loadFacts(row.i))).then(data=>{if(!workspace.isConnected||currentEpoch!==epoch)return;state.serviceFacts=Object.fromEntries(rows.map((row,i)=>[row.i,data[i]]));update();});}
    if(!supported.has(type))return;
    try{
        const {recipientContext}=await import('./care-recipient.mjs');
        const version=epoch,data=await recipientContext();
        if(!workspace.isConnected||epoch!==version)return;
        if(!state.touched&&data?.profile){state.grade=data.profile.grade||'';state.burden=data.profile.burden||'';state.profileLoaded=true;status='내 정보의 등급·본인부담 유형을 불러왔어요. 이용 일수·시간은 아래 기본값을 확인해 주세요.';draw();}
        else if(!state.touched){status=data?'저장한 등급이 없어요. 여기에서 선택하거나 내 정보에 저장할 수 있어요.':'회원가입 없이도 등급과 이용 조건을 직접 선택해 계산할 수 있어요.';update();}
    }catch{if(!state.touched){status='저장 정보를 불러오지 못했어요. 등급과 본인부담 유형을 직접 선택해 주세요.';update();}}
}

globalThis.addEventListener?.('care:session',event=>{
    const id=event.detail?.user?.id||null;
    if(owner!==undefined&&owner!==id){epoch++;states.clear();for(const item of mounted){if(item.workspace.isConnected)item.reset();else mounted.delete(item);}}
    owner=id;
});
globalThis.addEventListener?.('pageshow',event=>{if(event.persisted){epoch++;states.clear();for(const item of mounted)if(item.workspace.isConnected)item.reset();}});
globalThis.addEventListener?.('care:recipient-changed',()=>{epoch++;states.clear();for(const item of mounted)if(item.workspace.isConnected)item.reset();});
/** SOFTM-PERSONAL-COST END */
