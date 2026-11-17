/* SOFTM-HOMECARE-PILOT START 날짜:20261118 : 무료 시범운영 기관·권한·사진·익명 일별 통계 스키마 */
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'suspended')),
    content_revision INTEGER NOT NULL DEFAULT 1 CONSTRAINT content_revision_positive CHECK (content_revision >= 1),
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS institution_profiles (
    institution_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    operating_hours_json TEXT NOT NULL DEFAULT '{}',
    transportation TEXT NOT NULL DEFAULT '',
    capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
    available_slots INTEGER CHECK (available_slots IS NULL OR available_slots >= 0),
    confirmed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CHECK (capacity IS NULL OR available_slots IS NULL OR available_slots <= capacity)
);

CREATE TABLE IF NOT EXISTS institution_programs (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    schedule TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_programs_institution_sort
    ON institution_programs(institution_id, sort_order, created_at);

CREATE TRIGGER IF NOT EXISTS trg_programs_max_ten
BEFORE INSERT ON institution_programs
WHEN (SELECT COUNT(*) FROM institution_programs WHERE institution_id = NEW.institution_id) >= 10
BEGIN
    SELECT RAISE(ABORT, 'program_limit_reached');
END;

CREATE TABLE IF NOT EXISTS institution_memberships (
    institution_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (institution_id, user_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_status
    ON institution_memberships(user_id, status);

CREATE TABLE IF NOT EXISTS institution_invites (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'editor', 'viewer')),
    expires_at TEXT NOT NULL,
    claimed_by TEXT,
    claimed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invites_institution
    ON institution_invites(institution_id, expires_at);

CREATE TABLE IF NOT EXISTS institution_claims (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    truthful INTEGER NOT NULL CHECK (truthful = 1),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    approved_role TEXT CHECK (approved_role IS NULL OR approved_role IN ('owner', 'editor', 'viewer')),
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (institution_id, user_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CHECK (status <> 'approved' OR approved_role IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_claims_status_created
    ON institution_claims(status, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_user_status
    ON institution_claims(user_id, status);

CREATE TRIGGER IF NOT EXISTS trg_claim_approval_membership
AFTER UPDATE OF status ON institution_claims
WHEN OLD.status = 'pending' AND NEW.status = 'approved'
BEGIN
    INSERT INTO institution_memberships
        (institution_id, user_id, role, status, approved_at, created_at, updated_at)
    VALUES
        (NEW.institution_id, NEW.user_id, NEW.approved_role, 'approved',
         datetime('now'), datetime('now'), datetime('now'));
    UPDATE institutions
       SET name = NEW.institution_name, updated_at = datetime('now')
     WHERE id = NEW.institution_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_claim_pending_limit_insert
BEFORE INSERT ON institution_claims
WHEN NEW.status = 'pending' AND
     (SELECT COUNT(*) FROM institution_claims
       WHERE user_id = NEW.user_id AND status = 'pending') >= 5
BEGIN
    SELECT RAISE(ABORT, 'claim_limit_reached');
END;

CREATE TRIGGER IF NOT EXISTS trg_claim_pending_limit_update
BEFORE UPDATE OF status ON institution_claims
WHEN OLD.status <> 'pending' AND NEW.status = 'pending' AND
     (SELECT COUNT(*) FROM institution_claims
       WHERE user_id = NEW.user_id AND status = 'pending') >= 5
BEGIN
    SELECT RAISE(ABORT, 'claim_limit_reached');
END;

CREATE TABLE IF NOT EXISTS institution_photos (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    caption TEXT NOT NULL DEFAULT '',
    alt_text TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
    is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_institution_sort
    ON institution_photos(institution_id, is_cover DESC, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_one_cover
    ON institution_photos(institution_id)
    WHERE is_cover = 1;

CREATE TABLE IF NOT EXISTS r2_deletion_queue (
    r2_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_attempt_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_photos_max_ten
BEFORE INSERT ON institution_photos
WHEN (SELECT COUNT(*) FROM institution_photos WHERE institution_id = NEW.institution_id) >= 10
BEGIN
    SELECT RAISE(ABORT, 'photo_limit_reached');
END;

CREATE TABLE IF NOT EXISTS pilot_agreements (
    institution_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'withdrawn')),
    agreement_version TEXT NOT NULL,
    accepted_by TEXT,
    accepted_at TEXT,
    withdrawn_by TEXT,
    withdrawn_at TEXT,
    contact_role TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    free_pilot_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (free_pilot_confirmed IN (0, 1)),
    no_payment_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (no_payment_confirmed IN (0, 1)),
    content_authority_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (content_authority_confirmed IN (0, 1)),
    no_billing_commitment INTEGER NOT NULL DEFAULT 1 CHECK (no_billing_commitment = 1),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CHECK (status <> 'accepted' OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL)),
    CHECK (status <> 'withdrawn' OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS pilot_agreement_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id TEXT NOT NULL,
    agreement_version TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('accepted', 'withdrawn', 'reaccepted', 'version_changed')
    ),
    actor_user_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    contact_role TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    free_pilot_confirmed INTEGER NOT NULL CHECK (free_pilot_confirmed IN (0, 1)),
    no_payment_confirmed INTEGER NOT NULL CHECK (no_payment_confirmed IN (0, 1)),
    content_authority_confirmed INTEGER NOT NULL CHECK (content_authority_confirmed IN (0, 1)),
    no_billing_commitment INTEGER NOT NULL CHECK (no_billing_commitment = 1),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pilot_agreement_events_institution_time
    ON pilot_agreement_events(institution_id, occurred_at, id);

CREATE TRIGGER IF NOT EXISTS trg_pilot_agreement_event_insert
AFTER INSERT ON pilot_agreements
BEGIN
    INSERT INTO pilot_agreement_events
        (institution_id, agreement_version, event_type, actor_user_id, occurred_at,
         contact_role, notes, free_pilot_confirmed, no_payment_confirmed,
         content_authority_confirmed, no_billing_commitment)
    VALUES
        (NEW.institution_id, NEW.agreement_version, NEW.status,
         CASE WHEN NEW.status = 'accepted' THEN NEW.accepted_by ELSE NEW.withdrawn_by END,
         CASE WHEN NEW.status = 'accepted' THEN NEW.accepted_at ELSE NEW.withdrawn_at END,
         NEW.contact_role, NEW.notes, NEW.free_pilot_confirmed, NEW.no_payment_confirmed,
         NEW.content_authority_confirmed, NEW.no_billing_commitment);
END;

CREATE TRIGGER IF NOT EXISTS trg_pilot_agreement_event_update
AFTER UPDATE OF status, agreement_version ON pilot_agreements
BEGIN
    INSERT INTO pilot_agreement_events
        (institution_id, agreement_version, event_type, actor_user_id, occurred_at,
         contact_role, notes, free_pilot_confirmed, no_payment_confirmed,
         content_authority_confirmed, no_billing_commitment)
    VALUES
        (NEW.institution_id, NEW.agreement_version,
         CASE
             WHEN NEW.status = 'withdrawn' THEN 'withdrawn'
             WHEN OLD.status = 'withdrawn' THEN 'reaccepted'
             WHEN OLD.agreement_version <> NEW.agreement_version THEN 'version_changed'
             ELSE 'accepted'
         END,
         CASE WHEN NEW.status = 'accepted' THEN NEW.accepted_by ELSE NEW.withdrawn_by END,
         CASE WHEN NEW.status = 'accepted' THEN NEW.accepted_at ELSE NEW.withdrawn_at END,
         NEW.contact_role, NEW.notes, NEW.free_pilot_confirmed, NEW.no_payment_confirmed,
         NEW.content_authority_confirmed, NEW.no_billing_commitment);
END;

CREATE TRIGGER IF NOT EXISTS trg_pilot_agreement_events_block_update
BEFORE UPDATE ON pilot_agreement_events
BEGIN
    SELECT RAISE(ABORT, 'pilot_agreement_events_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_pilot_agreement_events_block_delete
BEFORE DELETE ON pilot_agreement_events
WHEN EXISTS (
    SELECT 1 FROM institutions i WHERE i.id = OLD.institution_id
)
BEGIN
    SELECT RAISE(ABORT, 'pilot_agreement_events_immutable');
END;

CREATE TABLE IF NOT EXISTS institution_event_daily (
    day TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('detail_view', 'phone_click', 'inquiry_click', 'directions_click')
    ),
    event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (day, institution_id, event_type),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_daily_institution_day
    ON institution_event_daily(institution_id, day);

CREATE TABLE IF NOT EXISTS event_dedup (
    day TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('detail_view', 'phone_click', 'inquiry_click', 'directions_click')
    ),
    visitor_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (day, institution_id, event_type, visitor_hash),
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_dedup_cleanup ON event_dedup(day);

CREATE TRIGGER IF NOT EXISTS trg_event_dedup_increment
AFTER INSERT ON event_dedup
BEGIN
    INSERT INTO institution_event_daily (day, institution_id, event_type, event_count, updated_at)
    VALUES (NEW.day, NEW.institution_id, NEW.event_type, 1, datetime('now'))
    ON CONFLICT(day, institution_id, event_type)
    DO UPDATE SET event_count = event_count + 1, updated_at = datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_block_suspended_insert
BEFORE INSERT ON institution_profiles
WHEN (SELECT status FROM institutions WHERE id = NEW.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_profile_block_suspended_update
BEFORE UPDATE ON institution_profiles
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_profile_block_suspended_delete
BEFORE DELETE ON institution_profiles
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;

CREATE TRIGGER IF NOT EXISTS trg_program_block_suspended_insert
BEFORE INSERT ON institution_programs
WHEN (SELECT status FROM institutions WHERE id = NEW.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_program_block_suspended_update
BEFORE UPDATE ON institution_programs
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_program_block_suspended_delete
BEFORE DELETE ON institution_programs
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;

CREATE TRIGGER IF NOT EXISTS trg_photo_block_suspended_insert
BEFORE INSERT ON institution_photos
WHEN (SELECT status FROM institutions WHERE id = NEW.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_photo_block_suspended_update
BEFORE UPDATE ON institution_photos
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_photo_block_suspended_delete
BEFORE DELETE ON institution_photos
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;

CREATE TRIGGER IF NOT EXISTS trg_agreement_block_suspended_insert
BEFORE INSERT ON pilot_agreements
WHEN (SELECT status FROM institutions WHERE id = NEW.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_agreement_block_suspended_update
BEFORE UPDATE ON pilot_agreements
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;
CREATE TRIGGER IF NOT EXISTS trg_agreement_block_suspended_delete
BEFORE DELETE ON pilot_agreements
WHEN (SELECT status FROM institutions WHERE id = OLD.institution_id) = 'suspended'
BEGIN SELECT RAISE(ABORT, 'institution_suspended'); END;

CREATE TRIGGER IF NOT EXISTS trg_profile_insert_draft
AFTER INSERT ON institution_profiles
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_profile_content_update_draft
AFTER UPDATE OF display_name, summary, phone, email, website, address,
                operating_hours_json, transportation, capacity, available_slots
ON institution_profiles
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_profile_delete_draft
AFTER DELETE ON institution_profiles
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = OLD.institution_id AND status <> 'suspended';
END;

CREATE TRIGGER IF NOT EXISTS trg_program_insert_draft
AFTER INSERT ON institution_programs
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_program_update_draft
AFTER UPDATE ON institution_programs
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_program_delete_draft
AFTER DELETE ON institution_programs
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = OLD.institution_id AND status <> 'suspended';
END;

CREATE TRIGGER IF NOT EXISTS trg_photo_insert_draft
AFTER INSERT ON institution_photos
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_photo_update_draft
AFTER UPDATE ON institution_photos
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_photo_delete_draft
AFTER DELETE ON institution_photos
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = OLD.institution_id AND status <> 'suspended';
END;

CREATE TRIGGER IF NOT EXISTS trg_agreement_insert_withdraw_draft
AFTER INSERT ON pilot_agreements WHEN NEW.status = 'withdrawn'
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_agreement_update_withdraw_draft
AFTER UPDATE OF status ON pilot_agreements WHEN NEW.status = 'withdrawn'
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = NEW.institution_id AND status <> 'suspended';
END;
CREATE TRIGGER IF NOT EXISTS trg_agreement_delete_draft
AFTER DELETE ON pilot_agreements
BEGIN
    UPDATE institutions SET status = 'draft', published_at = NULL, updated_at = datetime('now')
     WHERE id = OLD.institution_id AND status <> 'suspended';
END;

CREATE TRIGGER IF NOT EXISTS trg_institution_publish_confirm
AFTER UPDATE OF status, published_at ON institutions WHEN NEW.status = 'published'
BEGIN
    UPDATE institution_profiles SET confirmed_at = NEW.published_at, updated_at = datetime('now')
     WHERE institution_id = NEW.id;
END;
/* SOFTM-HOMECARE-PILOT END */
