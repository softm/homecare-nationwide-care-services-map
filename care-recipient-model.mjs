/** SOFTM-GUARDIAN START 날짜:20261120 : 보호자 계정과 돌봄 대상자를 구분하고 공개 근거가 있는 조건만 연결 */
export const RELATIONSHIPS = {parent:'부모님',spouse:'배우자',child:'자녀',sibling:'형제·자매',family:'그 밖의 가족',self:'본인',other:'기타'};
export const SEXES = {female:'여성',male:'남성',unspecified:'선택하지 않음'};
export const MOBILITY = {independent:'혼자 이동할 수 있어요',assisted:'이동할 때 도움이 필요해요',wheelchair:'휠체어를 이용해요',bedridden:'누워 지내는 시간이 많아요',unspecified:'아직 확인 중이에요'};
export const CARE_NEEDS = {daily:'일상생활 도움',cognitive:'인지 활동·기억력 지원',dementia:'치매 돌봄',rehabilitation:'재활 지원',nursing:'간호 지원',meals:'식사 도움'};
/** SOFTM-PERSONAL-COST START 날짜:20261121 : 등급 미확인을 보존하고 별도 동의한 비용 조건만 보호자 계정에 저장 */
export const CARE_GRADES = {'':'아직 모르거나 신청 전이에요','1':'1등급','2':'2등급','3':'3등급','4':'4등급','5':'5등급',cognitive:'인지지원등급'};
export const CARE_BURDENS = {'':'아직 확인하지 않았어요',general:'일반 본인부담',reduced40:'본인부담금 40% 감경',reduced60:'본인부담금 60% 감경',exempt:'본인부담금 면제'};
export const CARE_CONSENT_VERSION = 'care-recipient-20261121-cost';
/** SOFTM-PERSONAL-COST END */
export function validateRecipient(value) {
    if(!value || typeof value!=='object' || Array.isArray(value) || typeof value.relationship!=='string' || typeof value.sex!=='string' || typeof value.mobility!=='string' || !Object.hasOwn(RELATIONSHIPS,value.relationship) || !Object.hasOwn(SEXES,value.sex) || !Object.hasOwn(MOBILITY,value.mobility)) throw new Error('대상자와의 관계·성별·이동 상태를 확인해 주세요.');
    if(!Array.isArray(value.careNeeds) || value.careNeeds.length>Object.keys(CARE_NEEDS).length || value.careNeeds.some(key=>typeof key!=='string'||!Object.hasOwn(CARE_NEEDS,key))) throw new Error('필요한 돌봄 항목을 확인해 주세요.');
    const allowed=value.relationship==='self'?['self']:['subject-consent','legal-representative'];
    if(!allowed.includes(value.authority) || value.healthConsent!==true) throw new Error('대상자 본인의 동의 또는 법정대리 권한과 돌봄 상태의 별도 수집·이용 동의를 확인해 주세요.');
    /** SOFTM-PERSONAL-COST START 날짜:20261121 : 기존 미입력 대상자를 유지하며 임의 등급·감경과 배열 입력을 거부 */
    const grade=value.grade??'',burden=value.burden??'';
    if(typeof grade!=='string'||!Object.hasOwn(CARE_GRADES,grade)||typeof burden!=='string'||!Object.hasOwn(CARE_BURDENS,burden))throw new Error('장기요양등급과 본인부담 유형을 확인해 주세요.');
    return {relationship:value.relationship,sex:value.sex,mobility:value.mobility,careNeeds:[...new Set(value.careNeeds)],authority:value.authority,grade,burden};
    /** SOFTM-PERSONAL-COST END */
}
export function recipientSummary(profile) {
    if(!profile)return '돌봄 대상자 정보를 아직 입력하지 않았어요.';
    return [RELATIONSHIPS[profile.relationship],profile.sex!=='unspecified'?SEXES[profile.sex]:'',MOBILITY[profile.mobility],...(profile.careNeeds||[]).map(key=>CARE_NEEDS[key])].filter(Boolean).join(' · ');
}
export function recipientMatching(profile,type) {
    if(!profile)return {criteria:[],questions:[]};
    const needs=new Set(profile.careNeeds),criteria=[];
    if(type!=='nursing-hospital') {
        if(needs.has('cognitive'))criteria.push('feature:cognitive');
        if(needs.has('dementia'))criteria.push('feature:dementia');
    }
    // 확인되지 않은 간호·재활·빈자리나 성별별 생활공간으로 후보를 임의 제외하지 않습니다.
    const questions=['이용 안내·일정 변경·상담 회신을 가입한 보호자에게 연락해 주실 수 있나요?'];
    if(profile.sex!=='unspecified')questions.push('성별에 맞는 생활공간과 돌봄 지원을 이용할 수 있나요?');
    if(['assisted','wheelchair','bedridden'].includes(profile.mobility))questions.push('이동·승하차·체위 변경에 도움이 필요한 경우 어떤 지원을 받을 수 있나요?');
    if(needs.has('daily'))questions.push('세면·옷 갈아입기·화장실 이용 등 일상생활 도움은 어떻게 제공하나요?');
    if(needs.has('rehabilitation'))questions.push('재활 지원 프로그램과 담당 인력, 실제 이용 조건을 확인할 수 있나요?');
    if(needs.has('nursing'))questions.push('필요한 간호 지원의 범위와 시간대별 담당 인력을 확인할 수 있나요?');
    if(needs.has('meals'))questions.push('식사 도움과 식이 조절이 필요한 경우 어떤 지원을 받을 수 있나요?');
    if(type==='nursing-hospital' && (needs.has('dementia')||needs.has('cognitive')))questions.push('인지·치매 돌봄이 필요한 경우 입원 조건과 지원 범위를 확인할 수 있나요?');
    return {criteria,questions};
}
/** SOFTM-GUARDIAN END */
