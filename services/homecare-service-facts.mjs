/** SOFTM-KEY START 날짜:20261121 : 항목별 공개확인·시범기관 권한·감사 이력을 기존 D1에 저장 */
import {FACT_KEYS,emptyValue,cleanFact,FRESH_SECONDS,allFresh,factState,knownFact} from '../care-service-facts-model.mjs';
export class ServiceFactError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const fail=(...args)=>{throw new ServiceFactError(...args);};
const sql=(db,q,...args)=>db.prepare(q).bind(...args),now=()=>Math.floor(Date.now()/1000);
const cleanText=(v,max=500)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const idCheck=id=>{if(!/^\d{11}$/.test(id))fail('invalid_institution','공단 주야간보호 기관을 선택해 주세요.');return id;};
const active=`p.enabled=1 AND i.status<>'suspended' AND EXISTS(SELECT 1 FROM pilot_agreements a WHERE a.institution_id=i.id AND a.status='accepted') AND EXISTS(SELECT 1 FROM member_registrations r JOIN institution_memberships m ON m.institution_id=r.institution_id AND m.user_id=r.user_id WHERE r.institution_id=i.id AND r.institution_type='daycare' AND r.status='approved' AND m.status='approved' AND m.role IN('owner','editor'))`;
export async function publicFacts(db,ids){
 if(ids!==undefined&&(!Array.isArray(ids)||!ids.length||ids.length>50))fail('invalid_batch','기관은 한 번에 1~50곳까지 조회할 수 있습니다.');
 ids?.forEach(idCheck);const unique=ids?[...new Set(ids)]:null;
 const institutions=(await sql(db,`SELECT i.id,i.name FROM service_pilot p JOIN institutions i ON i.id=p.institution_id WHERE ${active}${unique?` AND i.id IN(${unique.map(()=>'?').join(',')})`:''} ORDER BY i.id LIMIT 50`,...(unique||[])).all()).results;
 if(!institutions.length)return [];
 const rows=(await sql(db,`SELECT institution_id,item_key,live_json FROM service_facts WHERE institution_id IN(${institutions.map(()=>'?').join(',')}) AND live_json IS NOT NULL`,...institutions.map(i=>i.id)).all()).results;
 return institutions.map(i=>{const facts={};for(const row of rows.filter(r=>r.institution_id===i.id)){const raw=JSON.parse(row.live_json);facts[row.item_key]={...cleanFact(row.item_key,raw),source:raw.source,confirmedAt:raw.confirmedAt,expiresAt:raw.expiresAt};}return {institutionId:i.id,name:i.name,facts,recent:allFresh(facts),pilot:true};});
}
async function eligible(db,id){
 const row=await sql(db,`SELECT i.id,i.name FROM institutions i WHERE i.id=? AND i.status<>'suspended' AND EXISTS(SELECT 1 FROM member_registrations r JOIN institution_memberships m ON m.user_id=r.user_id AND m.institution_id=r.institution_id WHERE r.institution_id=i.id AND r.status='approved' AND r.institution_type='daycare' AND m.status='approved' AND m.role IN('owner','editor'))`,idCheck(id)).first();
 if(!row)fail('pilot_not_eligible','승인된 주야간보호 기관만 시범운영할 수 있습니다.',403);return row;
}
async function access(db,id,user,isAdmin,write=false){
 await eligible(db,id);
 if(!isAdmin&&!await sql(db,`SELECT user_id FROM institution_memberships WHERE institution_id=? AND user_id=? AND status='approved' AND role IN(${write?"'owner','editor'":"'owner','editor','viewer'"})`,id,user.id).first())fail('forbidden','이 기관의 운영정보를 관리할 권한이 없습니다.',403);
 const pilot=await sql(db,'SELECT * FROM service_pilot WHERE institution_id=?',id).first();
 if(write&&(!pilot?.enabled||!await sql(db,"SELECT institution_id FROM pilot_agreements WHERE institution_id=? AND status='accepted'",id).first()))fail('pilot_inactive','무료 시범운영 참여와 정보 공개 동의가 필요합니다.',403);
 return pilot;
}
export async function managedFacts(db,id,user,isAdmin=false){
 const pilot=await access(db,id,user,isAdmin),items={};
 for(const row of (await sql(db,'SELECT * FROM service_facts WHERE institution_id=?',id).all()).results)items[row.item_key]={draft:JSON.parse(row.draft_json),live:row.live_json?JSON.parse(row.live_json):null,revision:row.revision};
 return {institutionId:id,pilot:pilot?{enabled:Boolean(pilot.enabled),revision:pilot.revision,joinedAt:pilot.joined_at}:null,items,audit:(await sql(db,'SELECT item_key,action,revision,reason,occurred_at,support_minutes FROM service_fact_audit WHERE institution_id=? ORDER BY id DESC LIMIT 30',id).all()).results};
}
const audit=(db,id,key,user,action,revision,snapshot,reason,minutes,time)=>sql(db,'INSERT INTO service_fact_audit(institution_id,item_key,actor_id,action,revision,snapshot_json,reason,support_minutes,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)',id,key,user.id,action,revision,JSON.stringify(snapshot),reason,minutes,time);
async function transaction(db,statements){try{await db.batch(statements);}catch(e){if(/CHECK constraint failed|UNIQUE constraint failed/.test(String(e)))fail('conflict','다른 창에서 변경했습니다. 새로 불러온 뒤 다시 확인해 주세요.',409);throw e;}}
export async function enrollPilot(db,id,user,body){
 await eligible(db,id);if(typeof body.enabled!=='boolean'||!Number.isInteger(body.revision)||body.revision<0)fail('invalid_pilot','참여 여부와 버전을 확인해 주세요.');
 const reason=cleanText(body.reason);if(!reason)fail('reason_required','담당자와 확인한 참여·중단 사유를 입력해 주세요.');
 if(body.enabled&&!await sql(db,"SELECT institution_id FROM pilot_agreements WHERE institution_id=? AND status='accepted'",id).first())fail('agreement_required','기관 담당자가 기관 관리에서 무료 시범운영·공개 동의를 먼저 완료해야 합니다.',409);
 const old=await sql(db,'SELECT * FROM service_pilot WHERE institution_id=?',id).first(),time=now();
 if((old?.revision||0)!==body.revision)fail('conflict','시범운영 상태가 변경되었습니다. 새로 불러와 주세요.',409);
 const statements=[old?sql(db,'UPDATE service_pilot SET enabled=?,revision=CASE WHEN revision=? THEN revision+1 ELSE 0 END,updated_at=? WHERE institution_id=?',Number(body.enabled),body.revision,time,id):sql(db,'INSERT INTO service_pilot(institution_id,enabled,joined_at,updated_at) VALUES(?,?,?,?)',id,Number(body.enabled),time,time)];
 if(!old)for(const key of FACT_KEYS)statements.push(sql(db,'INSERT INTO service_facts(institution_id,item_key,draft_json,updated_at) VALUES(?,?,?,?)',id,key,JSON.stringify({value:emptyValue(key),conditions:''}),time));
 statements.push(audit(db,id,'pilot',user,body.enabled?'enroll':'pause',body.revision+1,{enabled:body.enabled},reason,0,time));await transaction(db,statements);return managedFacts(db,id,user,true);
}
export async function changeFacts(db,id,user,body,isAdmin=false){
 await access(db,id,user,isAdmin,true);
 if(!['draft','confirm'].includes(body.action)||!Array.isArray(body.items)||!body.items.length||body.items.length>5)fail('invalid_items','저장·확인할 항목을 선택해 주세요.');
 if(new Set(body.items.map(i=>i.key)).size!==body.items.length)fail('duplicate_items','같은 항목을 중복 확인할 수 없습니다.');
 const reason=cleanText(body.reason),minutes=body.supportMinutes??0;
 if(isAdmin&&(!reason||!Number.isInteger(minutes)||minutes<0||minutes>240))fail('reason_required','통화 근거와 운영 지원 시간(0~240분)을 입력해 주세요.');
 const time=now(),statements=[];
 for(const [index,item] of body.items.entries()){
  if(!FACT_KEYS.includes(item.key)||!Number.isInteger(item.revision))fail('invalid_revision','항목과 저장 버전을 확인해 주세요.');
  const old=await sql(db,'SELECT * FROM service_facts WHERE institution_id=? AND item_key=?',id,item.key).first();if(!old||old.revision!==item.revision)fail('conflict','변경된 항목이 있습니다. 새로 불러온 뒤 다시 확인해 주세요.',409);
  const draft=body.action==='draft'?cleanFact(item.key,item):JSON.parse(old.draft_json);
  if(body.action==='confirm'&&!knownFact(item.key,draft))fail('empty_confirmation','미확인 항목을 최신 확인으로 게시할 수 없습니다. 내용을 먼저 저장해 주세요.');
  const live=body.action==='confirm'?{...draft,source:isAdmin?'operator_phone':'institution',confirmedAt:time,expiresAt:time+FRESH_SECONDS}:null;
  statements.push(sql(db,`UPDATE service_facts SET draft_json=?,live_json=${live?'?':'live_json'},revision=CASE WHEN revision=? THEN revision+1 ELSE 0 END,updated_at=? WHERE institution_id=? AND item_key=?`,JSON.stringify(draft),...(live?[JSON.stringify(live)]:[]),item.revision,time,id,item.key));
  statements.push(audit(db,id,item.key,user,body.action,item.revision+1,live||draft,reason,index===0&&isAdmin?minutes:0,time));
 }
 await transaction(db,statements);return managedFacts(db,id,user,isAdmin);
}
export async function pilotDashboard(db){
 const time=now(),rows=(await sql(db,`SELECT DISTINCT i.id,i.name,p.enabled,p.revision,p.joined_at FROM institutions i JOIN member_registrations r ON r.institution_id=i.id LEFT JOIN service_pilot p ON p.institution_id=i.id WHERE r.status='approved' AND r.institution_type='daycare' AND i.status<>'suspended' ORDER BY i.name LIMIT 100`).all()).results;
 const history=(await sql(db,"SELECT institution_id,item_key,action,occurred_at,support_minutes FROM service_fact_audit WHERE occurred_at>=? AND action IN('draft','confirm')",time-28*86400).all()).results;
 const activeFacts=await publicFacts(db);
 const institutions=rows.map(row=>{const facts=activeFacts.find(i=>i.institutionId===row.id)?.facts||{};const rounds=[0,1].map(n=>FACT_KEYS.every(key=>history.some(h=>h.action==='confirm'&&h.institution_id===row.id&&h.item_key===key&&h.occurred_at>=time-(n+1)*7*86400&&h.occurred_at<time-n*7*86400)));return {...row,enabled:Boolean(row.enabled),revision:row.revision||0,recent:allFresh(facts),needsConfirmation:FACT_KEYS.filter(k=>factState(facts[k])!=='fresh'||!knownFact(k,facts[k])),rounds};});
 return {institutions,rounds:[0,1].map(n=>{const eligible=institutions.filter(i=>i.enabled&&i.joined_at<=time-(n+1)*7*86400);return {eligible:eligible.length,complete:eligible.filter(i=>i.rounds[n]).length};}),supportMinutes:history.filter(h=>h.occurred_at>=time-7*86400).reduce((s,h)=>s+h.support_minutes,0),events:(await sql(db,'SELECT day,source,stage,count(*) AS count FROM service_pilot_events WHERE created_at>=? GROUP BY day,source,stage ORDER BY day DESC',time-28*86400).all()).results};
}
export const PILOT_STAGES=['visit','save','compare','phone','consultation','visit_scheduled','visit_completed'];
export const PILOT_SOURCES=['direct','institution','welfare','community'];
/** SOFTM-KEY END */

// SOFTM-KEY 날짜:20261121 : 익명 집계 요청도 작은 본문만 읽어 자원 사용을 제한
export async function readPilotEvent(request){
 if(!request.headers.get('Content-Type')?.toLowerCase().includes('application/json'))fail('json_required','JSON 요청만 허용합니다.',415);
 const reader=request.body?.getReader();if(!reader)fail('invalid_event','집계 항목이 없습니다.');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();fail('request_too_large','집계 요청이 너무 큽니다.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('invalid_json','JSON 형식을 확인해 주세요.');}
}
