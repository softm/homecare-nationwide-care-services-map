/** SOFTM-MEMBERS START 날짜:20261120 : 예시 DB 식별자로 운영 배포하거나 개발 인증 설정을 공개하지 않도록 차단 */
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const config=JSON.parse(source.replace(/^\s*\/\/.*$/gm,''));
for(const db of config.d1_databases){if(!db.database_id||db.database_id.startsWith('00000000-'))throw Error(`${db.binding}: 실제 Cloudflare D1 ID를 설정해야 합니다.`);}
if(config.vars.ENVIRONMENT&&config.vars.ENVIRONMENT!=='production')throw Error('개발 인증 설정으로 운영 배포할 수 없습니다.');
for(const key of ['API_ORIGIN','WEB_ORIGIN']){const url=new URL(config.vars[key]);if(url.protocol!=='https:'||url.pathname!=='/')throw Error(`${key}: HTTPS 공식 Origin이 필요합니다.`);}
console.log('배포 설정 검증 완료. SNS 비밀키·네이버 검수·도메인 DNS는 별도로 확인하세요.');
/** SOFTM-MEMBERS END */
