/** SOFTM-MEMBERS 날짜:20261120 : 계정 교체·자료 보존·단일 기관 비교·세션 응답 경쟁 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as workspace from '../care-workspace.mjs';
import {memberInstitutionId} from '../institution-content.js';
const reset=()=>{const data=new Map();globalThis.sessionStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};return data;};
test('새 기기에서 합쳐 저장해도 서버 조건을 잃지 않고 빈 저장본을 불러오면 이전 지도 조건도 해제한다',()=>{const data=reset();workspace.saveConditions({type:'daycare',preferences:['evaluation-ab']});const remote=workspace.snapshot();workspace.clearWorkspace();assert.deepEqual(workspace.mergeSnapshots(remote,workspace.snapshot()).conditions,remote.conditions);workspace.saveConditions({type:'facility',preferences:['photos']});workspace.applySnapshot({...remote,conditions:null});assert.equal(workspace.conditions(),null);assert.equal(data.has('careMatch:v1'),false);});
test('기존 지도 키를 사용하고 담은 후보는 유지하면서 비교 선택만 3곳으로 제한한다',()=>{reset();workspace.setBasket('daycare',['1','2','3','4']);for(const id of ['1','2','3'])workspace.toggleActive('daycare',id);assert.throws(()=>workspace.toggleActive('daycare','4'),/3곳/);assert.equal(workspace.basketIds('daycare').length,4);workspace.setBasket('daycare',['2','3','4']);assert.deepEqual(workspace.activeIds('daycare'),['2','3']);});
test('상담을 다시 열어도 답변·최근 수정 시각을 바꾸지 않고 기관 초안은 계정 전환 시 삭제한다',()=>{const data=reset();const row={i:'1',n:'기관'};const record=workspace.ensureRecord('daycare',row);record.questions[0].answer='답변';record.updatedAt=123;workspace.write('careMemberRecords:v1',[record]);assert.equal(workspace.ensureRecord('daycare',row).updatedAt,123);assert.equal(workspace.records()[0].questions[0].answer,'답변');workspace.switchOwner('a');workspace.write('careInstitutionDraft:a',{businessNumber:'개인 자료'});workspace.switchOwner('b');assert.equal(data.has('careInstitutionDraft:a'),false);assert.deepEqual(workspace.records(),[]);});
test('단일 기관 상세는 비교할 다른 기관 없이 실제 평가 지표를 표시한다',()=>{const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../care-comparison-workspace.js',import.meta.url),'utf8'),context);const row={i:'1',n:'기관',g:'A',ey:2024};const single=context.CareComparisonWorkspace.render({rows:[row],single:true});assert.match(single,/2024년/);assert.match(single,/공공 평가/);assert.doesNotMatch(single,/시설을 2곳 이상/);assert.match(context.CareComparisonWorkspace.render({rows:[row]}),/시설을 2곳 이상/);});
test('병원 원문 식별자는 서버와 동일한 출처 포함 키가 되고 공단 번호는 그대로 유지한다',()=>{assert.equal(memberInstitutionId('24215000294','daycare'),'24215000294');const raw='병원+/=identifier';assert.equal(memberInstitutionId(raw,'nursing-hospital'),'hira:'+Buffer.from(raw).toString('base64url'));assert.equal(memberInstitutionId(raw,'daycare'),'');});
test('중복 세션 조회를 하나로 합치고 늦은 401 응답이 새 로그인을 지우지 않는다',async t=>{const original=globalThis.fetch; t.after(()=>globalThis.fetch=original);let finish,calls=0;globalThis.fetch=()=>{calls++;return new Promise(resolve=>finish=resolve)};const m=await import('../care-member-api.mjs');const first=m.refreshSession(),second=m.refreshSession();assert.equal(first,second);assert.equal(calls,1);const signedIn={user:{id:'new-user'},csrf:'new-csrf'};m.acceptSession(signedIn);finish(Response.json({error:{message:'만료'}},{status:401}));assert.deepEqual(await first,signedIn);assert.deepEqual(m.currentSession(),signedIn);});

/** SOFTM-RECIPIENT-RETURN START 날짜:20261121 : 대상자 입력 복귀를 허용해도 외부 주소·임의 해시를 허용하지 않는지 확인 */
test('대상자 입력 복귀 위치만 보존하고 외부 로그인 복귀 주소를 차단한다',async t=>{
 const previous=globalThis.location;t.after(()=>{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;});
 globalThis.location={href:'https://homecare.designboard.net/care-account.html',origin:'https://homecare.designboard.net'};
 const {safeReturn}=await import('../care-member-api.mjs');
 assert.equal(safeReturn('care-account.html#careRecipient'),'/care-account.html#careRecipient');
 assert.equal(safeReturn('care-account.html#unrecognized'),'/care-account.html');
 assert.equal(safeReturn('care-share.html#private-fragment'),'/care-share.html');
 for(const url of ['https://example.invalid/care-account.html#careRecipient','//example.invalid/care-account.html','javascript:alert(1)'])assert.equal(safeReturn(url),'care-account.html');
});
/** SOFTM-RECIPIENT-RETURN END */
