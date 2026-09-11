/** SOFTM-VOICE-SEARCH START 날짜:20260909 : 취소 후 늦은 응답과 권한 오류가 검색어를 덮어쓰지 않는지 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../voice-search.js';
const { createSession } = globalThis.CareVoiceSearch;
function setup() {
    const updates = [], instances = [];
    class Recognition { constructor() { instances.push(this); } start() { this.onstart(); } abort() { this.aborted = true; this.onend(); } }
    return { updates, instances, session: createSession(Recognition, value => updates.push(value)) };
}
test('한국어 인식 결과를 전체 구간으로 조합하고 완료 상태를 알린다', () => {
    const { session, instances, updates } = setup(); session.start();
    const r = instances[0]; assert.equal(r.lang, 'ko-KR');
    r.onresult({ results: [[{ transcript: '광명' }], [{ transcript: '행복센터' }]] }); r.onend();
    assert.equal(updates.at(-2).text, '광명 행복센터'); assert.equal(updates.at(-1).state, 'ready');
});
test('취소한 세션의 결과와 오류는 무시한다', () => {
    const { session, instances, updates } = setup(); session.start(); session.cancel(); const count = updates.length;
    instances[0].onresult({ results: [[{ transcript: '늦은 응답' }]] }); instances[0].onerror({ error: 'network' }); instances[0].onend();
    assert.equal(updates.length, count); assert.equal(instances[0].aborted, true);
});
test('재시작하면 이전 세션을 중지하고 새 결과만 수신한다', () => {
    const { session, instances, updates } = setup(); session.start(); session.start();
    instances[0].onresult({ results: [[{ transcript: '이전' }]] }); instances[1].onresult({ results: [[{ transcript: '현재' }]] });
    assert.equal(updates.at(-1).text, '현재'); assert.equal(instances[0].aborted, true); session.cancel(); // SOFTM-VOICE-RESPONSE 날짜:20260911 : 검사 종료 후 인식 대기 타이머 정리
});
test('권한 거부 안내를 end 이벤트가 지우지 않는다', () => {
    const { session, instances, updates } = setup(); session.start(); instances[0].onerror({ error: 'not-allowed' }); instances[0].onend();
    assert.equal(updates.at(-1).state, 'error'); assert.match(updates.at(-1).message, /사이트 설정/);
});
test('음성 미감지와 미지원 환경에서 직접 입력을 안내한다', () => {
    const { session, instances, updates } = setup(); session.start(); instances[0].onend(); assert.match(updates.at(-1).message, /들리지/);
    createSession(null, value => updates.push(value)).start(); assert.match(updates.at(-1).message, /직접 입력/);
});
/** SOFTM-VOICE-SEARCH END */

/** SOFTM-VOICE-TEXT START 날짜:20260909 : 말하기 중지 후 뒤늦은 최종 결과도 텍스트로 전달되는지 검사 */
test('중지는 취소하지 않고 최종 인식 결과를 기다린다', () => {
 const updates=[];let recognizer;
 class Recognition { constructor(){recognizer=this;} start(){this.onstart();} stop(){this.stopped=true;} abort(){this.aborted=true;} }
 const session=createSession(Recognition,value=>updates.push(value));session.start();session.stop();
 assert.equal(recognizer.stopped,true);assert.notEqual(recognizer.aborted,true);
 recognizer.onresult({results:[[{transcript:'옥길동 주간보호센터'}]]});recognizer.onend();
 assert.equal(updates.at(-2).text,'옥길동 주간보호센터');assert.equal(updates.at(-1).state,'ready');
});
/** SOFTM-VOICE-TEXT END */

/** SOFTM-VOICE-RESPONSE START 날짜:20260911 : 서비스 시작만 발생하는 무응답과 입력 단계별 실패를 재현 */
function responseClock(t){
 const pending=new Map();let id=0;
 t.mock.method(globalThis,'setTimeout',(fn,delay)=>{pending.set(++id,{fn,delay});return id;});
 t.mock.method(globalThis,'clearTimeout',key=>pending.delete(key));
 return ms=>{for(const [key,task] of [...pending])if(task.delay<=ms&&pending.delete(key))task.fn();};
}
test('입력이 시작되지 않으면 대기를 종료하고 늦은 결과를 무시한다', t => {
 const tick=responseClock(t);
 const {session,instances,updates}=setup();session.start();
 assert.match(updates.at(-1).message,/마이크 입력을 기다/);
 tick(21000);
 assert.equal(instances[0].aborted,true);assert.match(updates.at(-1).message,/입력 시작 응답/);
 const count=updates.length;instances[0].onresult({results:[[{transcript:'뒤늦은 검색어'}]]});assert.equal(updates.length,count);
});
test('소리 감지와 텍스트 변환 무응답을 구분한다', t => {
 const tick=responseClock(t);
 const {session,instances,updates}=setup();session.start();const r=instances[0];
 r.onaudiostart();assert.match(updates.at(-1).message,/마이크가 연결/);
 r.onsoundstart();assert.match(updates.at(-1).message,/소리가 들어/);
 r.onspeechstart();assert.match(updates.at(-1).message,/말소리를 감지/);
 tick(30000);assert.match(updates.at(-1).message,/텍스트 변환 응답이 없습니다/);assert.equal(r.aborted,true);
});
test('마이크 입력 이후 소리 미감지와 결과 보존을 구분한다', t => {
 const tick=responseClock(t);const {session,instances,updates}=setup();session.start();instances[0].onaudiostart();
 tick(30000);assert.match(updates.at(-1).message,/말소리가 감지되지/);
 session.start();instances[1].onresult({results:[[{transcript:'광명 주간보호'}]]});tick(21000);assert.equal(updates.at(-1).state,'ready');
});
/** SOFTM-VOICE-RESPONSE END */
