/** SOFTM-GUARDIAN START 날짜:20261120 : 대상자 정보 소유권·별도 동의를 검증하고 연락 대상을 가입한 보호자로 고정 */
import {validateRecipient,CARE_CONSENT_VERSION} from '../../../care-recipient-model.mjs';
import {sql,fail,now,text,jsonBody} from './security.mjs';
export function validateGuardian(name,phone) {
    const guardian={name:text(name,80),phone:text(phone,30)};
    if(!guardian.name || !/^01[016789]-?\d{3,4}-?\d{4}$/.test(guardian.phone))fail('guardian_required','연락받을 보호자의 이름과 휴대폰 번호를 입력해 주세요.');
    return guardian;
}
async function readRecipient(env,user) {
    const row=await sql(env.DB,'SELECT * FROM care_recipients WHERE user_id=?',user.id).first();
    const owner=await sql(env.DB,'SELECT name,phone FROM users WHERE id=?',user.id).first();
    return {profile:row?JSON.parse(row.payload):null,revision:row?.revision||0,consentVersion:row?.consent_version||'',consentAt:row?.consent_at||null,guardian:{userId:user.id,name:owner.name,phone:owner.phone},contactRecipient:'account-holder'};
}
export async function recipientRoute(request,env,user) {
    if(user.kind!=='personal')fail('personal_only','돌봄 대상자 정보는 일반회원 계정에서 관리합니다.',403);
    if(request.method==='GET')return Response.json({data:await readRecipient(env,user)});
    const revision=Number(request.headers.get('If-Match'));
    if(!request.headers.has('If-Match') || !Number.isSafeInteger(revision) || revision<0)fail('revision_required','대상자 정보를 먼저 불러와 주세요.',428);
    if(request.method==='DELETE') {
        const removed=await sql(env.DB,'DELETE FROM care_recipients WHERE user_id=? AND revision=? RETURNING user_id',user.id,revision).first();
        if(!removed)fail('conflict','대상자 정보가 변경되었습니다. 새로 불러와 주세요.',409);
        return Response.json({data:await readRecipient(env,user)});
    }
    const body=await jsonBody(request,10000);
    let profile;
    try{profile=validateRecipient(body);}catch(e){fail('invalid_recipient',e.message);}
    validateGuardian(user.name,user.phone);
    const time=now();
    // 연락처는 요청 본문의 임의 값 대신 로그인 계정에서만 읽습니다.
    const updateProfile=revision===0?
        sql(env.DB,'INSERT INTO care_recipients(user_id,payload,consent_version,consent_at,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(user_id) DO NOTHING',user.id,JSON.stringify(profile),CARE_CONSENT_VERSION,time,time):
        sql(env.DB,'UPDATE care_recipients SET payload=?,consent_version=?,consent_at=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?',JSON.stringify(profile),CARE_CONSENT_VERSION,time,time,user.id,revision);
    const results=await env.DB.batch([updateProfile]);
    if(!results[0]?.meta?.changes)fail('conflict','다른 화면에서 대상자 정보가 변경되었습니다. 새로 불러와 주세요.',409);
    return Response.json({data:await readRecipient(env,user)});
}
/** SOFTM-GUARDIAN END */
