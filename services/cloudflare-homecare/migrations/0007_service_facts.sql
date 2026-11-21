-- SOFTM-KEY START 날짜:20261121 : 기관 소개 수정과 분리한 항목별 초안·확인 스냅샷 및 시범운영 기록
CREATE TABLE service_pilot (
 institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 joined_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE service_facts (
 institution_id TEXT NOT NULL REFERENCES service_pilot(institution_id) ON DELETE CASCADE,
 item_key TEXT NOT NULL CHECK(item_key IN('schedule','availability','shuttle','fees','support')),
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
 live_json TEXT CHECK(live_json IS NULL OR json_valid(live_json)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(institution_id,item_key)
);
CREATE TABLE service_fact_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
 item_key TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('enroll','pause','draft','confirm')),
 revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 reason TEXT NOT NULL DEFAULT '', support_minutes INTEGER NOT NULL DEFAULT 0 CHECK(support_minutes BETWEEN 0 AND 240),
 occurred_at INTEGER NOT NULL
);
CREATE INDEX service_fact_audit_time ON service_fact_audit(institution_id,occurred_at);
CREATE TABLE service_pilot_events (
 day TEXT NOT NULL, institution_id TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN('visit','save','compare','phone','consultation','visit_scheduled','visit_completed')),
 source TEXT NOT NULL CHECK(source IN('direct','institution','welfare','community')),
 visitor_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(day,institution_id,stage,visitor_hash)
);
CREATE INDEX service_pilot_events_time ON service_pilot_events(created_at);
-- SOFTM-KEY END
