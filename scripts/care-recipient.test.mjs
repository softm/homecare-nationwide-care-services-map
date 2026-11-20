/** SOFTM-GUARDIAN START 날짜:20261120 : 공개 근거 밖의 임의 순위·민감정보 공유를 만들지 않는 조건 변환 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipient,recipientMatching,recipientSummary,RELATIONSHIPS,SEXES} from '../care-recipient-model.mjs';
const profile={relationship:'parent',sex:'female',mobility:'wheelchair',careNeeds:['dementia','cognitive','rehabilitation','nursing'],authority:'subject-consent',healthConsent:true};
test('관계와 성별로 시설 우열을 추정하지 않고 공개 돌봄 조건만 연결한다',()=>{
 for(const relationship of Object.keys(RELATIONSHIPS))for(const sex of Object.keys(SEXES))assert.deepEqual(recipientMatching({...profile,relationship,sex},'daycare').criteria,['feature:cognitive','feature:dementia']);
 assert.deepEqual(recipientMatching(profile,'nursing-hospital').criteria,[]);
 assert.deepEqual(recipientMatching({...profile,careNeeds:['nursing','rehabilitation','daily','meals']},'facility').criteria,[]);
});
test('지원 필요는 일반 상담 질문으로 연결하고 연락은 가입 보호자에게 요청한다',()=>{
 const matching=recipientMatching(profile,'daycare');assert.ok(matching.questions.some(q=>q.includes('가입한 보호자')));assert.ok(matching.questions.some(q=>q.includes('재활')));assert.ok(matching.questions.some(q=>q.includes('성별')));
 for(const value of ['부모님','여성','휠체어','subject-consent'])assert.equal(matching.questions.join('').includes(value),false);
 assert.match(recipientSummary(profile),/부모님.*여성.*휠체어/);assert.deepEqual(recipientMatching(null,'daycare'),{criteria:[],questions:[]});
});
test('본인과 가족의 동의 권한을 구분하고 임의 추가 필드를 저장하지 않는다',()=>{
 const sanitized=validateRecipient({...profile,phone:'010-1111-2222',diagnosis:'임의 상세 진단',contactUserId:'attacker'});assert.equal('phone' in sanitized,false);assert.equal('diagnosis' in sanitized,false);assert.equal('contactUserId' in sanitized,false);
 assert.throws(()=>validateRecipient({...profile,relationship:'self'}));assert.throws(()=>validateRecipient({...profile,authority:'self'}));assert.throws(()=>validateRecipient({...profile,healthConsent:false}));assert.throws(()=>validateRecipient({...profile,relationship:['parent']}));assert.throws(()=>validateRecipient({...profile,careNeeds:[['dementia']]}));
 assert.equal(validateRecipient({...profile,relationship:'self',authority:'self'}).authority,'self');
});
/** SOFTM-GUARDIAN END */
