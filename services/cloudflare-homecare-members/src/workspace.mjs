/** SOFTM-MEMBERS START 날짜:20261120 : 사용자 기록과 공유에 허용한 필드만 저장하여 인증·위치 캐시의 유입을 차단 */
import { fail, text } from './security.mjs';
export const TYPES=['daycare','facility','home-care','home-nursing','home-bath','short-stay','welfare-equipment','dementia','nursing-hospital'];
const strings=(values,max=Infinity)=>{if(!Array.isArray(values))return [];if(values.length>max||values.some(v=>typeof v!=='string'||!v.length||v.length>256))fail('invalid_list','저장 항목의 형식이나 개수를 확인해 주세요.');return [...new Set(values)];};
const multiline=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):'';
export function cleanRecord(value) {
 if(!value||!TYPES.includes(value.type)||!text(value.institutionId,256))fail('invalid_record','상담 기관을 확인해 주세요.');
 const questions=(Array.isArray(value.questions)?value.questions:[]).slice(0,60).map(q=>({id:text(q.id,512),text:text(q.text,500),answer:multiline(q.answer,2000),checked:q.checked===true})).filter(q=>q.id&&q.text);
 const checklist=(Array.isArray(value.checklist)?value.checklist:[]).slice(0,30).map(q=>({id:text(q.id,80),text:text(q.text,300),checked:q.checked===true})).filter(q=>q.id&&q.text);
 return {key:`${value.type}:${text(value.institutionId,256)}`,type:value.type,institutionId:text(value.institutionId,256),name:text(value.name,120),address:text(value.address,200),phone:text(value.phone,40),status:['preparing','contacted','scheduled','completed'].includes(value.status)?value.status:'preparing',visitAt:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.visitAt)?value.visitAt:'',questions,checklist,notes:multiline(value.notes,5000),updatedAt:Number.isSafeInteger(value.updatedAt)?value.updatedAt:0};
}
export function cleanWorkspace(value) {
 if(value?.v!==1)fail('invalid_workspace','저장 형식을 확인해 주세요.');
 const baskets={},activeCompare={};
 for(const type of TYPES) { baskets[type]=strings(value.baskets?.[type]); activeCompare[type]=strings(value.activeCompare?.[type],3).filter(id=>baskets[type].includes(id)); }
 const conditions=value.conditions&&typeof value.conditions==='object'?{type:TYPES.includes(value.conditions.type)?value.conditions.type:'daycare',address:text(value.conditions.address,160),radius:[1,3,5,10].includes(Number(value.conditions.radius))?Number(value.conditions.radius):3,preferences:strings(value.conditions.preferences,20),province:text(value.conditions.province,40),city:text(value.conditions.city,40)}:null;
 const consultations=(Array.isArray(value.consultations)?value.consultations:[]).map(cleanRecord);
 if(new Set(consultations.map(r=>r.key)).size!==consultations.length)fail('duplicate_records','같은 기관의 상담 기록이 중복되었습니다.');
 return {v:1,baskets,activeCompare,conditions,consultations};
}
export function shareSnapshot(value) {
 if(value.records?.length>3)fail('share_limit','한 번에 3곳까지 공유할 수 있습니다.');
 const records=(Array.isArray(value.records)?value.records:[]).map(cleanRecord);
 if(!records.length)fail('empty_share','공유할 상담 기록을 선택해 주세요.');
 return {title:text(value.title,100)||'우리 가족 시설 비교',records:records.map(r=>({type:r.type,institutionId:r.institutionId,name:r.name,status:r.status,questions:r.questions.map(q=>({text:q.text,checked:q.checked,...(value.includeAnswers===true?{answer:q.answer}:{})})),checklist:r.checklist.map(q=>({text:q.text,checked:q.checked})),...(value.includeNotes===true?{notes:r.notes}:{})}))};
}
/** SOFTM-MEMBERS END */
