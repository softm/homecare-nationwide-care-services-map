-- SOFTM-GUARDIAN START 날짜:20261120 : 돌봄 상태는 별도 동의와 버전으로 보관하고 연락처는 보호자 계정을 참조
CREATE TABLE care_recipients (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 payload TEXT NOT NULL,
 consent_version TEXT NOT NULL,
 consent_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
-- 동시 요청으로 보호자 연락처가 지워진 뒤 대상자만 남는 경우도 DB에서 막습니다.
CREATE TRIGGER care_recipient_requires_guardian BEFORE INSERT ON care_recipients
WHEN NOT EXISTS (
 SELECT 1 FROM users WHERE id=NEW.user_id AND length(trim(name))>0
 AND replace(phone,'-','') NOT GLOB '*[^0-9]*'
 AND length(replace(phone,'-','')) IN (10,11)
 AND substr(replace(phone,'-',''),1,3) IN ('010','011','016','017','018','019')
)
BEGIN SELECT RAISE(ABORT,'guardian_contact_required'); END;
CREATE TRIGGER care_guardian_contact_preserved BEFORE UPDATE OF name,phone ON users
WHEN EXISTS (SELECT 1 FROM care_recipients WHERE user_id=NEW.id)
AND (length(trim(NEW.name))=0 OR replace(NEW.phone,'-','') GLOB '*[^0-9]*'
 OR length(replace(NEW.phone,'-','')) NOT IN (10,11)
 OR substr(replace(NEW.phone,'-',''),1,3) NOT IN ('010','011','016','017','018','019'))
BEGIN SELECT RAISE(ABORT,'guardian_contact_required'); END;
-- SOFTM-GUARDIAN END
