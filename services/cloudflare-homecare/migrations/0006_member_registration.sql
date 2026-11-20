-- SOFTM-MEMBERS START 날짜:20261120 : 증빙 심사와 기관 권한 부여를 같은 D1 트랜잭션에서 처리
CREATE TABLE IF NOT EXISTS member_registrations (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, institution_id TEXT NOT NULL,
 institution_type TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN('nhis','hira','manual')),
 institution_name TEXT NOT NULL, address TEXT NOT NULL, business_number TEXT NOT NULL,
 representative TEXT NOT NULL, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, contact_email TEXT NOT NULL,
 document_key TEXT, document_type TEXT, document_name TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pending','needs_info','approved','rejected')),
 revision INTEGER NOT NULL DEFAULT 1, review_reason TEXT NOT NULL DEFAULT '', reviewed_by TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS registrations_user ON member_registrations(user_id,updated_at);
CREATE INDEX IF NOT EXISTS registrations_status ON member_registrations(status,updated_at);
CREATE TABLE IF NOT EXISTS registration_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, registration_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS member_document_deletions (r2_key TEXT PRIMARY KEY, user_id TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS registration_approve
BEFORE UPDATE OF status ON member_registrations
WHEN NEW.status='approved' AND OLD.status<>'approved'
BEGIN
 SELECT CASE WHEN NEW.document_key IS NULL THEN RAISE(ABORT,'document_required') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM institution_memberships WHERE institution_id=NEW.institution_id AND status='approved' AND role='owner' AND user_id<>NEW.user_id) THEN RAISE(ABORT,'institution_already_managed') END;
 INSERT OR IGNORE INTO institutions(id,name) VALUES(NEW.institution_id,NEW.institution_name);
 INSERT INTO institution_memberships(institution_id,user_id,role,status,approved_at)
 VALUES(NEW.institution_id,NEW.user_id,'owner','approved',datetime('now'))
 ON CONFLICT(institution_id,user_id) DO UPDATE SET role='owner',status='approved',approved_at=datetime('now'),updated_at=datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS registration_review_audit
AFTER UPDATE OF status ON member_registrations
WHEN OLD.status<>NEW.status
BEGIN
 INSERT INTO registration_events(registration_id,actor_id,action,reason,created_at)
 VALUES(NEW.id,CASE WHEN NEW.status IN('approved','needs_info','rejected') THEN NEW.reviewed_by ELSE NEW.user_id END,NEW.status,NEW.review_reason,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS registration_pending_limit
BEFORE INSERT ON member_registrations
WHEN (SELECT COUNT(*) FROM member_registrations WHERE user_id=NEW.user_id AND status<>'approved')>=5
BEGIN SELECT RAISE(ABORT,'registration_limit'); END;
-- SOFTM-MEMBERS END
