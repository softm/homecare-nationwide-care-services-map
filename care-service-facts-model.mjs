/** SOFTM-KEY START 날짜:20261121 : 최신 운영정보의 항목·단위·유효기간을 서버와 모든 화면에서 공유 */
export const FACT_KEYS=['schedule','availability','shuttle','fees','support'];
export const FACT_LABELS={schedule:'이용 요일·시간',availability:'요일별 자리·대기',shuttle:'송영 범위·조건',fees:'비급여 비용',support:'돌봄 지원 조건'};
export const DAYS=['월','화','수','목','금','토','일'];
export const FRESH_SECONDS=7*24*3600;
export const SOURCE_LABELS={institution:'기관 담당자 확인',operator_phone:'운영자 전화 확인'};
const reject=message=>{const e=new Error(message);e.status=400;e.code='invalid_service_fact';throw e;};
const text=(v,max=500)=>{if(v===undefined||v===null)return '';if(typeof v!=='string'||v.length>max)reject('입력 길이와 형식을 확인해 주세요.');return v.replace(/[\u0000-\u001f\u007f]/g,' ').trim();};
const amount=(v,max=10000000)=>{if(v===null||v===''||v===undefined)return null;if(!Number.isSafeInteger(v)||v<0||v>max)reject('금액·인원은 0 이상의 정수로 입력해 주세요.');return v;};
export function emptyValue(key){return {schedule:{days:[]},availability:{days:[]},shuttle:{areas:'',conditions:''},fees:{mealPerDay:null,snackPerDay:null,otherMonthly:null,complete:false},support:{details:''}}[key];}
export function cleanFact(key,input){
 if(!FACT_KEYS.includes(key)||!input||typeof input!=='object')reject('운영정보 항목을 확인해 주세요.');
 const v=input.value;if(!v||typeof v!=='object')reject('입력 값을 확인해 주세요.');let value;
 if(key==='schedule'||key==='availability'){
  if(!Array.isArray(v.days)||v.days.length>7)reject('요일을 확인해 주세요.');
  const days=v.days.map(d=>{if(!Number.isInteger(d.day)||d.day<1||d.day>7)reject('요일을 확인해 주세요.');
   if(key==='availability'){if(!['available','waiting','unavailable','unknown'].includes(d.state))reject('자리 상태를 선택해 주세요.');const count=amount(d.count,1000);if(d.state==='available'&&count===0)reject('0명은 이용 불가 또는 대기로 표시해 주세요.');return {day:d.day,state:d.state,count:d.state==='unknown'?null:count};}
   const start=text(d.start,5),end=text(d.end,5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end)reject('이용 시작·종료 시간을 확인해 주세요.');return {day:d.day,start,end};});
  if(new Set(days.map(d=>d.day)).size!==days.length)reject('요일을 중복 입력할 수 없습니다.');value={days:days.sort((a,b)=>a.day-b.day)};
 }else if(key==='shuttle')value={areas:text(v.areas),conditions:text(v.conditions)};
 else if(key==='fees')value={mealPerDay:amount(v.mealPerDay),snackPerDay:amount(v.snackPerDay),otherMonthly:amount(v.otherMonthly),complete:v.complete===true};
 else value={details:text(v.details,1000)};
 return {value,conditions:text(input.conditions)};
}
export function factState(fact,now=Date.now()/1000){
 if(!fact||!SOURCE_LABELS[fact.source]||!Number.isFinite(fact.confirmedAt)||fact.confirmedAt>now||!Number.isFinite(fact.expiresAt)||fact.expiresAt!==fact.confirmedAt+FRESH_SECONDS)return 'unknown';
 return fact.expiresAt>now?'fresh':'stale';
}
export function knownFact(key,fact){const v=fact?.value;if(!v)return false;if(key==='schedule')return Boolean(v.days?.length);if(key==='availability')return Boolean(v.days?.some(d=>d.state!=='unknown'));if(key==='shuttle')return Boolean(v.areas);if(key==='fees')return ['mealPerDay','snackPerDay','otherMonthly'].some(k=>v[k]!==null&&v[k]!==undefined);return Boolean(v.details);}
export function allFresh(facts,now=Date.now()/1000){return FACT_KEYS.every(key=>knownFact(key,facts?.[key])&&factState(facts[key],now)==='fresh');}
export function monthlyFees(fact,quantity,now=Date.now()/1000){
 if(factState(fact,now)!=='fresh')return {total:null,reason:fact?'비급여 재확인 필요':'비급여 미확인'};
 // SOFTM-KEY 날짜:20261121 : 자유문구 적용 조건을 충족한다고 추정해 확정 합계를 만들지 않음
 if(fact.conditions?.trim())return {total:null,reason:'비급여 적용 조건 확인 필요 · 직접 확인한 월 금액을 입력해 주세요'};
 const v=fact.value;
 if(!v.complete||['mealPerDay','snackPerDay','otherMonthly'].some(k=>!Number.isSafeInteger(v[k])||v[k]<0))return {total:null,reason:'일부 비급여 미확인'};
 if(!Number.isInteger(Number(quantity))||quantity<1||quantity>31)return {total:null,reason:'월 이용 일수 확인 필요'};
 return {total:(v.mealPerDay+v.snackPerDay)*Number(quantity)+v.otherMonthly,reason:`(식비 ${v.mealPerDay.toLocaleString('ko-KR')}원/일 + 간식비 ${v.snackPerDay.toLocaleString('ko-KR')}원/일) × ${quantity}일 + 기타 ${v.otherMonthly.toLocaleString('ko-KR')}원/월`};
}
export function factText(key,fact){
 const v=fact?.value;if(!v)return '미확인';
 if(key==='schedule')return v.days.length?v.days.map(d=>`${DAYS[d.day-1]} ${d.start}–${d.end}`).join(' · '):'이용 요일 미확인';
 if(key==='availability')return v.days.length?v.days.map(d=>`${DAYS[d.day-1]} ${({available:'상담 가능',waiting:'대기 접수',unavailable:'이용 불가',unknown:'미확인'})[d.state]}${d.count===null?'':` (${d.count}명)`}`).join(' · '):'요일별 자리 미확인';
 if(key==='shuttle')return [v.areas||'지역 미확인',v.conditions].filter(Boolean).join(' · ');
 if(key==='support')return v.details||'지원 조건 미확인';
 return [['식비',v.mealPerDay,'일'],['간식비',v.snackPerDay,'일'],['기타',v.otherMonthly,'월']].map(([label,n,unit])=>`${label} ${n===null?'미확인':`${n.toLocaleString('ko-KR')}원/${unit}`}`).join(' · ');
}
/** SOFTM-KEY END */
