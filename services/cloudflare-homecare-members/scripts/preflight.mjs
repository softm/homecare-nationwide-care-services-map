/** SOFTM-MEMBERS START 날짜:20261120 : 예시 DB 식별자로 운영 배포하거나 개발 인증 설정을 공개하지 않도록 차단 */
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const config=JSON.parse(source.replace(/^\s*\/\/.*$/gm,''));
for(const db of config.d1_databases){if(!db.database_id||db.database_id.startsWith('00000000-'))throw Error(`${db.binding}: 실제 Cloudflare D1 ID를 설정해야 합니다.`);}
if(config.vars.ENVIRONMENT&&config.vars.ENVIRONMENT!=='production')throw Error('개발 인증 설정으로 운영 배포할 수 없습니다.');
for(const key of ['API_ORIGIN','WEB_ORIGIN']){const url=new URL(config.vars[key]);if(url.protocol!=='https:'||url.pathname!=='/')throw Error(`${key}: HTTPS 공식 Origin이 필요합니다.`);}
/** SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 카드 없는 저장소 선택을 배포 구성에서도 유지하고 비밀키 커밋을 차단 */
if(config.r2_buckets?.length)throw Error('R2는 보류 상태입니다. 운영 구성에 R2 바인딩을 추가하지 마세요.');
if(config.vars.FILE_STORAGE_PROVIDER!=='supabase'||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.vars.SUPABASE_URL||'')||!config.vars.SUPABASE_DOCUMENTS_BUCKET)throw Error('Supabase 비공개 파일 저장소 구성을 확인하세요.');
if(config.vars.SUPABASE_SECRET_KEY)throw Error('Supabase 서버 키는 vars에 넣지 말고 Worker secret으로 등록하세요.');
console.log('배포 설정 검증 완료. 실제 Free 플랜·Worker secret·업로드 개방 조건·SNS·도메인 DNS는 별도로 확인하세요.');
/** SOFTM-SUPABASE-STORAGE END */
/** SOFTM-MEMBERS END */
