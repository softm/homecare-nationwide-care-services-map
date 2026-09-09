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
    assert.equal(updates.at(-1).text, '현재'); assert.equal(instances[0].aborted, true);
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
