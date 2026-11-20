-- SOFTM-MEMBERS START 날짜:20261120 : 아이디·SNS 가입 상태와 개인 기록·공유를 전용 계정에 귀속
PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE,
 kind TEXT NOT NULL CHECK(kind IN ('personal','institution')),
 onboarding TEXT NOT NULL DEFAULT 'pending' CHECK(onboarding IN ('pending','complete')),
 name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', province TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
 terms_version TEXT NOT NULL DEFAULT '', notifications INTEGER NOT NULL DEFAULT 1 CHECK(notifications IN(0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE credentials (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL);
CREATE TABLE identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(provider,subject));
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, authenticated_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE oauth_states (state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL, client_challenge TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE auth_codes (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_challenge TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE workspaces (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
CREATE TABLE shares (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, viewed_at INTEGER);
CREATE INDEX shares_user ON shares(user_id);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE administrators (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
CREATE TABLE deletion_jobs (user_id TEXT PRIMARY KEY, account_delete INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
-- SOFTM-MEMBERS END
