/** SOFTM-MEMBERS START 날짜:20261120 : 기관 가입·비공개 증빙·운영자 심사를 기존 기관 멤버십에 연결 */
import { fail, text, sql, now, id, boundedBody } from './security.mjs';
import { TYPES } from './workspace.mjs';
export const MAX_DOCUMENT=10*1024*1024;
export function canonicalInstitution(source,raw,existingId) {
 if(source==='manual')return existingId?.startsWith('manual:')?existingId:`manual:${id()}`;
 if(source==='nhis'&&/^\d{11}$/.test(raw))return raw;
 if(source==='hira'&&typeof raw==='string'&&raw.length>5&&raw.length<=256)return `hira:${Buffer.from(raw).toString('base64url')}`;
 fail('invalid_institution','기관 목록에서 등록할 기관을 선택해 주세요.');
}
export function registrationFields(body,old) {
 const fields={institution_type:text(body.institutionType,30),source:text(body.source,10),institution_name:text(body.institutionName,120),address:text(body.address,200),business_number:String(body.businessNumber||'').replace(/\D/g,''),representative:text(body.representative,80),contact_name:text(body.contactName,80),contact_phone:text(body.contactPhone,30),contact_email:text(body.contactEmail,200)};
 if(!TYPES.includes(fields.institution_type)||!['nhis','hira','manual'].includes(fields.source)||!fields.institution_name||!fields.address||!/^\d{10}$/.test(fields.business_number)||!fields.representative||!fields.contact_name||!/^0[0-9 -]{8,14}$/.test(fields.contact_phone)||!/^\S+@\S+\.\S+$/.test(fields.contact_email))fail('registration_required','기관 유형·기관·주소·사업자등록번호·대표자·담당자 연락처를 모두 입력해 주세요.');
 fields.institution_id=canonicalInstitution(fields.source,body.institutionId,old?.institution_id);
 return fields;
}
const publicRegistration=row=>{const {document_key,...safe}=row;return {...safe,hasDocument:Boolean(document_key)};};
export async function listRegistrations(env,user,admin=false) {
 const rows=await (admin?sql(env.INSTITUTIONS_DB,'SELECT * FROM member_registrations ORDER BY updated_at DESC LIMIT 100'):sql(env.INSTITUTIONS_DB,'SELECT * FROM member_registrations WHERE user_id=? ORDER BY updated_at DESC LIMIT 50',user.id)).all();
 return rows.results.map(publicRegistration);
}
export async function saveRegistration(env,user,body) {
 if(user.kind!=='institution')fail('institution_account_required','기관회원으로 로그인해 주세요.',403);
 const old=body.id?await sql(env.INSTITUTIONS_DB,'SELECT * FROM member_registrations WHERE id=? AND user_id=?',body.id,user.id).first():null;
 if(body.id&&!old)fail('not_found','신청을 찾지 못했습니다.',404);
 if(old&&['pending','approved'].includes(old.status))fail('review_in_progress','제출한 신청은 심사 결과를 확인한 후 수정할 수 있습니다.',409);
 if(old&&Number(body.revision)!==old.revision)fail('conflict','신청 내용이 변경되었습니다. 새로 불러와 주세요.',409);
 const fields=registrationFields(body,old),rid=old?.id||id(),time=now();
 if(old) {
  const sameInstitution=fields.institution_id===old.institution_id;
  const result=await sql(env.INSTITUTIONS_DB,`UPDATE member_registrations SET ${Object.keys(fields).map(k=>`${k}=?`).join(',')},status='draft',revision=revision+1,updated_at=?,document_key=?,document_type=?,document_name=? WHERE id=? AND revision=? RETURNING id`,...Object.values(fields),time,sameInstitution?old.document_key:null,sameInstitution?old.document_type:null,sameInstitution?old.document_name:null,rid,old.revision).first();
  if(!result)fail('conflict','다른 화면에서 신청이 변경되었습니다.',409);
  if(!sameInstitution&&old.document_key)await sql(env.INSTITUTIONS_DB,'INSERT OR IGNORE INTO member_document_deletions(r2_key,user_id) VALUES(?,?)',old.document_key,user.id).run();
 } else {
  const pending=await sql(env.INSTITUTIONS_DB,"SELECT COUNT(*) AS count FROM member_registrations WHERE user_id=? AND status<>'approved'",user.id).first();
  if(pending.count>=5)fail('registration_limit','진행 중인 신청을 먼저 완료해 주세요.',409);
  await sql(env.INSTITUTIONS_DB,`INSERT INTO member_registrations(id,user_id,${Object.keys(fields).join(',')},created_at,updated_at) VALUES(${Array(Object.keys(fields).length+4).fill('?').join(',')})`,rid,user.id,...Object.values(fields),time,time).run();
 }
 return publicRegistration(await sql(env.INSTITUTIONS_DB,'SELECT * FROM member_registrations WHERE id=?',rid).first());
}
export async function ownedRegistration(env,user,rid,admin=false) {
 const row=await sql(env.INSTITUTIONS_DB,'SELECT * FROM member_registrations WHERE id=?',rid).first();
 if(!row||(!admin&&row.user_id!==user.id))fail('not_found','신청을 찾지 못했습니다.',404);
 return row;
}
export function documentType(bytes) {
 if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d)return 'application/pdf';
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 fail('invalid_document','사업자등록증은 PDF·JPG·PNG 파일로 첨부해 주세요.',415);
}
export async function uploadDocument(request,env,user,rid) {
 const row=await ownedRegistration(env,user,rid);
 if(!['draft','needs_info','rejected'].includes(row.status))fail('locked','심사 중인 증빙은 변경할 수 없습니다.',409);
 if(Number(request.headers.get('Content-Length'))>MAX_DOCUMENT+16384)fail('too_large','증빙은 10MB 이하로 첨부해 주세요.',413);
 const bytesBody=await boundedBody(request,MAX_DOCUMENT+16384);
 let form;try{form=await new Response(bytesBody,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();}catch{fail('invalid_document','첨부파일 형식을 확인해 주세요.');}
 const file=form.get('document');
 if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>MAX_DOCUMENT)fail('invalid_document','10MB 이하의 사업자등록증을 첨부해 주세요.');
 const bytes=new Uint8Array(await file.arrayBuffer()),type=documentType(bytes),key=`registrations/${user.id}/${rid}/${id()}`;
 await env.DOCUMENTS.put(key,bytes,{httpMetadata:{contentType:type}});
 try {
  const result=await sql(env.INSTITUTIONS_DB,"UPDATE member_registrations SET document_key=?,document_type=?,document_name=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN('draft','needs_info','rejected') RETURNING id",key,type,text(file.name,120),now(),rid,row.revision).first();
  if(!result)fail('conflict','신청 내용이 변경되었습니다. 파일을 다시 첨부해 주세요.',409);
 }catch(error){await sql(env.INSTITUTIONS_DB,'INSERT OR IGNORE INTO member_document_deletions(r2_key,user_id) VALUES(?,?)',key,user.id).run();throw error;}
 if(row.document_key)await sql(env.INSTITUTIONS_DB,'INSERT OR IGNORE INTO member_document_deletions(r2_key,user_id) VALUES(?,?)',row.document_key,user.id).run();
 return publicRegistration(await ownedRegistration(env,user,rid));
}
export async function submitRegistration(env,user,rid,body) {
 const row=await ownedRegistration(env,user,rid);
 if(user.kind!=='institution'||!row.document_key||body.consent!==true)fail('submission_required','사업자등록증 첨부와 정보 확인 동의가 필요합니다.');
 // 기관 DB 반영 후 회원 DB 연결이 끊겼다면 같은 신청의 재시도로 가입 완료를 복구합니다.
 if(['pending','approved'].includes(row.status)){
  await sql(env.DB,"UPDATE users SET onboarding='complete',updated_at=? WHERE id=?",now(),user.id).run();
  return publicRegistration(row);
 }
 const result=await sql(env.INSTITUTIONS_DB,"UPDATE member_registrations SET status='pending',review_reason='',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN('draft','needs_info','rejected') RETURNING id",now(),rid,Number(body.revision)).first();
 if(!result)fail('conflict','신청 상태가 변경되었습니다. 다시 확인해 주세요.',409);
 await sql(env.DB,"UPDATE users SET onboarding='complete',updated_at=? WHERE id=?",now(),user.id).run();
 return publicRegistration(await ownedRegistration(env,user,rid));
}
export async function reviewRegistration(env,reviewer,rid,body) {
 if(!['approved','needs_info','rejected'].includes(body.status)||!text(body.reason,1000))fail('review_required','처리 결과와 사유를 입력해 주세요.');
 const result=await sql(env.INSTITUTIONS_DB,"UPDATE member_registrations SET status=?,review_reason=?,reviewed_by=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='pending' RETURNING *",body.status,text(body.reason,1000),reviewer.id,now(),rid,Number(body.revision)).first();
 if(!result)fail('conflict','다른 담당자가 처리했거나 신청이 변경되었습니다.',409);
 return publicRegistration(result);
}
export async function downloadDocument(env,user,rid,admin=false) {
 const row=await ownedRegistration(env,user,rid,admin);
 const object=row.document_key?await env.DOCUMENTS.get(row.document_key):null;
 if(!object)fail('document_not_found','첨부한 증빙을 찾지 못했습니다.',404);
 return new Response(object.body,{headers:{'Content-Type':row.document_type,'Content-Disposition':`attachment; filename="business-document.${row.document_type==='application/pdf'?'pdf':row.document_type==='image/png'?'png':'jpg'}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
/** SOFTM-MEMBERS END */
