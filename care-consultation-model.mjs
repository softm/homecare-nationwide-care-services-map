/** SOFTM-KEY START 날짜:20261121 : 보호자의 확인 결과는 공개 운영정보와 분리하여 선택적으로만 공유 */
import {FACT_KEYS} from './care-service-facts-model.mjs';
export const OUTCOMES={unknown:'확인 못함',possible:'가능하다고 안내받음',conditional:'조건부 가능',unavailable:'어려움'};
const text=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max).trim():'';
export function cleanUseConditions(v={}){return {days:[...new Set((Array.isArray(v.days)?v.days:[]).filter(d=>Number.isInteger(d)&&d>=1&&d<=7))].sort(),start:/^([01]\d|2[0-3]):[0-5]\d$/.test(v.start)?v.start:'',end:/^([01]\d|2[0-3]):[0-5]\d$/.test(v.end)?v.end:'',needs:text(v.needs,500)};}
export function cleanUseCheck(v){if(!v||typeof v!=='object')return null;const parsed=/^\d{4}-\d{2}-\d{2}$/.test(v.confirmedDate)?new Date(v.confirmedDate+'T00:00:00Z'):null;if(!parsed||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==v.confirmedDate||v.confirmedDate>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}))return null;return {confirmedDate:v.confirmedDate,conditions:cleanUseConditions(v.conditions),outcomes:Object.fromEntries(FACT_KEYS.map(key=>[key,Object.hasOwn(OUTCOMES,v.outcomes?.[key])?v.outcomes[key]:'unknown'])),visit:['none','scheduled','completed'].includes(v.visit)?v.visit:'none'};}
export function conditionsChanged(check,current){return Boolean(check)&&JSON.stringify(cleanUseConditions(check.conditions))!==JSON.stringify(cleanUseConditions(current));}
export function shareUseCheck(value){const check=cleanUseCheck(value);return check?{confirmedDate:check.confirmedDate,outcomes:check.outcomes,visit:check.visit}:null;}
/** SOFTM-KEY END */
