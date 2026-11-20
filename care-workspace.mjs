/** SOFTM-MEMBERS START 날짜:20261120 : 기존 지도 담기 키와 신규 상담 기록을 같은 작업공간으로 연결 */
export const LABELS={daycare:'주·야간보호센터',facility:'요양원·공동생활가정','home-care':'방문요양센터','home-nursing':'방문간호센터','home-bath':'방문목욕기관','short-stay':'단기보호센터','welfare-equipment':'복지용구사업소',dementia:'치매전담형 기관','nursing-hospital':'요양병원'};
export const TYPES=Object.keys(LABELS);
const store=()=>{try{return globalThis.sessionStorage;}catch{return null;}};
export function read(key,fallback){try{return JSON.parse(store()?.getItem(key)||'null')??fallback;}catch{return fallback;}}
export function write(key,value){const s=store();if(!s)throw new Error('브라우저 저장소를 사용할 수 없습니다.');s.setItem(key,JSON.stringify(value));globalThis.dispatchEvent?.(new CustomEvent('care:workspace-change'));}
export const basketIds=type=>read(`careCompare:v1:${type}`,[]);
export const activeIds=type=>read(`careCompareActive:v1:${type}`,[]).filter(id=>basketIds(type).includes(id)).slice(0,3);
export function setBasket(type,ids){write(`careCompare:v1:${type}`,[...new Set(ids.map(String))]);write(`careCompareActive:v1:${type}`,activeIds(type));}
export function toggleActive(type,id){const ids=activeIds(type);if(ids.includes(id))write(`careCompareActive:v1:${type}`,ids.filter(v=>v!==id));else {if(ids.length>=3)throw new Error('한 번에 최대 3곳까지 비교할 수 있습니다.');write(`careCompareActive:v1:${type}`,[...ids,id]);}}
export const conditions=()=>read('careUnifiedConditions:v1',null);
export function saveConditions(value){write('careUnifiedConditions:v1',value);write('careMatch:v1',{active:true,type:value.type,preferences:value.preferences||[]});}
export const records=()=>read('careMemberRecords:v1',[]);
export function questionId(text){return `q:${text.trim().normalize('NFC')}`;}
export function saveRecord(record){const all=records(),index=all.findIndex(r=>r.key===record.key),next={...record,updatedAt:Date.now()};if(index>=0)all[index]=next;else all.push(next);write('careMemberRecords:v1',all);return next;}
export function ensureRecord(type,row,questions=[]){
 const key=`${type}:${row.i}`,existing=records().find(r=>r.key===key);
 const defaults=['현재 입소·이용 가능한 자리와 대기 기간은 어떻게 되나요?','본인부담금과 비급여를 포함한 실제 월 비용은 얼마인가요?','필요한 돌봄을 제공하는 인력과 야간 대응을 확인할 수 있나요?','가족 방문과 상담은 어떻게 진행되나요?'];
 const list=[...new Set([...questions,...defaults])].map(text=>({id:questionId(text),text,answer:'',checked:false}));
 if(existing){const previous=new Map(existing.questions.map(q=>[q.id,q]));const additions=list.filter(q=>!previous.has(q.id));if(!additions.length)return existing;existing.questions.push(...additions);return saveRecord(existing);}
 return saveRecord({key,type,institutionId:String(row.i),name:row.n||'',address:row.a||'',phone:row.phone||'',status:'preparing',visitAt:'',questions:list,notes:'',checklist:[['space','생활공간·이동 동선 확인'],['hygiene','청결·식사 환경 확인'],['staff','담당 인력과 응급 대응 확인'],['cost','계약서·비용 항목 확인']].map(([id,text])=>({id,text,checked:false}))});
}
export function snapshot(){return {v:1,baskets:Object.fromEntries(TYPES.map(t=>[t,basketIds(t)])),activeCompare:Object.fromEntries(TYPES.map(t=>[t,activeIds(t)])),conditions:conditions(),consultations:records()};}
export function applySnapshot(value){if(value?.v!==1)throw new Error('저장본 형식을 확인해 주세요.');for(const type of TYPES){write(`careCompare:v1:${type}`,value.baskets?.[type]||[]);write(`careCompareActive:v1:${type}`,(value.activeCompare?.[type]||[]).slice(0,3));}write('careMemberRecords:v1',value.consultations||[]);if(value.conditions)saveConditions(value.conditions);else {store()?.removeItem('careUnifiedConditions:v1');store()?.removeItem('careMatch:v1');}}
export function mergeSnapshots(remote,local){const result={...local,conditions:local.conditions||remote?.conditions||null,baskets:{},activeCompare:{}};for(const type of TYPES){result.baskets[type]=[...new Set([...(remote?.baskets?.[type]||[]),...(local.baskets[type]||[])])];result.activeCompare[type]=local.activeCompare[type]?.length?local.activeCompare[type]:(remote?.activeCompare?.[type]||[]).slice(0,3);}const map=new Map((remote?.consultations||[]).map(r=>[r.key,r]));for(const record of local.consultations)map.set(record.key,record);result.consultations=[...map.values()];return result;}
export function clearWorkspace(){const s=store();if(!s)return;for(let i=s.length-1;i>=0;i--){const key=s.key(i);if(/^(careCompare:|careCompareActive:|careConsultation:|careMember|careUnifiedConditions:|careMatch:|careAnalysisDraft:|careInstitutionDraft:|careOAuthProof$)/.test(key))s.removeItem(key);}globalThis.dispatchEvent?.(new CustomEvent('care:workspace-change'));}
export function switchOwner(userId){const s=store();if(!s)return;const previous=s.getItem('careWorkspaceOwner');if(previous&&previous!==userId)clearWorkspace();if(userId)s.setItem('careWorkspaceOwner',userId);else s.removeItem('careWorkspaceOwner');}
/** SOFTM-MEMBERS END */
