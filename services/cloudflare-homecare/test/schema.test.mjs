import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

/** SOFTM-HOMECARE-PILOT START 날짜:20261118 : D1 상태 전이·중지 보호·중복 집계와 승인 비복구 계약을 실제 SQLite로 검증 */

const hasSqlite = spawnSync("sqlite3", ["-version"], { encoding: "utf8" }).status === 0;
const migrationOne = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const schemaSql = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

test("fresh migration은 게시·draft·철회·suspended·일별 중복 불변식을 만든다", { skip: !hasSqlite }, () => {
  const directory = mkdtempSync(join(tmpdir(), "homecare-worker-schema-"));
  const database = join(directory, "test.sqlite");
  const schemaDatabase = join(directory, "schema.sqlite");
  try {
    execFileSync("sqlite3", [database], {
      input: migrationOne + readFileSync(new URL("../migrations/0006_member_registration.sql", import.meta.url), "utf8"),
      encoding: "utf8",
    });
    execFileSync("sqlite3", [schemaDatabase], { input: schemaSql, encoding: "utf8" });
    const inventorySql = `
      SELECT type || ':' || name
        FROM sqlite_master
       WHERE type IN ('table', 'index', 'trigger')
         AND name NOT LIKE 'sqlite_%'
       ORDER BY type, name;
    `;
    const migrationInventory = execFileSync("sqlite3", [database], {
      input: inventorySql,
      encoding: "utf8",
    }).trim();
    const schemaInventory = execFileSync("sqlite3", [schemaDatabase], {
      input: inventorySql,
      encoding: "utf8",
    }).trim();
    assert.equal(migrationInventory, schemaInventory);
    const normalizeDdl = (value) => value.replace(/\s+/g, " ").trim();
    const migrationDdl = execFileSync("sqlite3", [database], {
      input: ".schema",
      encoding: "utf8",
    });
    const schemaDdl = execFileSync("sqlite3", [schemaDatabase], {
      input: ".schema",
      encoding: "utf8",
    });
    assert.equal(normalizeDdl(migrationDdl), normalizeDdl(schemaDdl));
    execFileSync("sqlite3", [database], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO institutions(id, name, status) VALUES('inst-1', '테스트기관', 'draft');
        INSERT INTO institution_profiles(institution_id, display_name) VALUES('inst-1', '테스트기관');
        INSERT INTO pilot_agreements(
          institution_id, status, agreement_version, accepted_by, accepted_at,
          contact_role, notes,
          free_pilot_confirmed, no_payment_confirmed, content_authority_confirmed
        ) VALUES(
          'inst-1', 'accepted', 'homecare-pilot-20261118-v1', 'user-1',
          '2026-11-18 01:00:00', '센터장', '최초 수락 메모', 1, 1, 1
        );
        UPDATE institutions SET status='published', published_at=datetime('now') WHERE id='inst-1';
        INSERT INTO institution_programs(id, institution_id, title) VALUES('program-1', 'inst-1', '활동');
        INSERT OR IGNORE INTO event_dedup(day, institution_id, event_type, visitor_hash)
          VALUES('2026-11-18', 'inst-1', 'detail_view', 'hash-1');
        INSERT OR IGNORE INTO event_dedup(day, institution_id, event_type, visitor_hash)
          VALUES('2026-11-18', 'inst-1', 'detail_view', 'hash-1');
      `,
      encoding: "utf8",
    });
    const draftAndCount = execFileSync("sqlite3", [database], {
      input: "SELECT status FROM institutions WHERE id='inst-1'; SELECT event_count FROM institution_event_daily WHERE institution_id='inst-1';",
      encoding: "utf8",
    }).trim().split("\n");
    assert.deepEqual(draftAndCount, ["draft", "1"]);

    execFileSync("sqlite3", [database], {
      input: "UPDATE institutions SET status='suspended' WHERE id='inst-1';",
      encoding: "utf8",
    });
    assert.throws(() => execFileSync("sqlite3", [database], {
      input: "UPDATE institution_programs SET title='우회 수정' WHERE id='program-1';",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }));
    const title = execFileSync("sqlite3", [database], {
      input: "SELECT title FROM institution_programs WHERE id='program-1';",
      encoding: "utf8",
    }).trim();
    assert.equal(title, "활동");

    execFileSync("sqlite3", [database], {
      input: `
        UPDATE institutions SET status='draft' WHERE id='inst-1';
        UPDATE institutions SET status='published', published_at=datetime('now') WHERE id='inst-1';
        UPDATE pilot_agreements
           SET status='withdrawn', withdrawn_by='user-2', withdrawn_at='2026-11-18 02:00:00'
         WHERE institution_id='inst-1';
      `,
      encoding: "utf8",
    });
    const withdrawnState = execFileSync("sqlite3", [database], {
      input: "SELECT status FROM institutions WHERE id='inst-1';",
      encoding: "utf8",
    }).trim();
    assert.equal(withdrawnState, "draft");
    const agreementAudit = execFileSync("sqlite3", [database], {
      input: `
        SELECT accepted_by || ':' || accepted_at || ':' || withdrawn_by || ':' || withdrawn_at ||
               ':' || contact_role || ':' || notes || ':' ||
               free_pilot_confirmed || no_payment_confirmed || content_authority_confirmed
          FROM pilot_agreements WHERE institution_id='inst-1';
      `,
      encoding: "utf8",
    }).trim();
    assert.equal(
      agreementAudit,
      "user-1:2026-11-18 01:00:00:user-2:2026-11-18 02:00:00:센터장:최초 수락 메모:111",
    );

    execFileSync("sqlite3", [database], {
      input: `
        INSERT INTO institutions(id, name) VALUES('inst-claim', '승인기관');
        INSERT INTO institution_claims(
          id, institution_id, user_id, institution_name, contact_name, contact_email, contact_phone, truthful
        ) VALUES('claim-1', 'inst-claim', 'claim-user', '검토 승인 기관', '담당자', 'claim@example.com', '02-0000-0000', 1);
        UPDATE institution_claims
           SET status='approved', approved_role='owner', reviewed_by='operator',
               reviewed_at=datetime('now'), updated_at=datetime('now')
         WHERE id='claim-1' AND status='pending' AND revision=1;
      `,
      encoding: "utf8",
    });
    const approvedClaim = execFileSync("sqlite3", [database], {
      input: `
        SELECT status || ':' || revision FROM institution_claims WHERE id='claim-1';
        SELECT status || ':' || role FROM institution_memberships
         WHERE institution_id='inst-claim' AND user_id='claim-user';
        SELECT name FROM institutions WHERE id='inst-claim';
      `,
      encoding: "utf8",
    }).trim().split("\n");
    assert.deepEqual(approvedClaim, ["approved:1", "approved:owner", "검토 승인 기관"]);

    execFileSync("sqlite3", [database], {
      input: `
        UPDATE institution_memberships SET status='revoked'
         WHERE institution_id='inst-claim' AND user_id='claim-user';
        UPDATE institution_claims
           SET status='approved', approved_role='owner', reviewed_by='operator-2'
         WHERE id='claim-1' AND status='pending' AND revision=1;
      `,
      encoding: "utf8",
    });
    const replayedMembership = execFileSync("sqlite3", [database], {
      input: "SELECT status FROM institution_memberships WHERE institution_id='inst-claim' AND user_id='claim-user';",
      encoding: "utf8",
    }).trim();
    assert.equal(replayedMembership, "revoked");

    execFileSync("sqlite3", [database], {
      input: `
        INSERT INTO institutions(id, name) VALUES('inst-conflict', '철회기관');
        INSERT INTO institution_memberships(institution_id, user_id, role, status)
          VALUES('inst-conflict', 'revoked-user', 'owner', 'revoked');
        INSERT INTO institution_claims(
          id, institution_id, user_id, institution_name, contact_name, contact_email, contact_phone, truthful, revision
        ) VALUES('claim-conflict', 'inst-conflict', 'revoked-user', '철회 기관', '담당자', 'revoked@example.com', '02-0000-0000', 1, 3);
      `,
      encoding: "utf8",
    });
    assert.throws(() => execFileSync("sqlite3", [database], {
      input: `
        UPDATE institution_claims
           SET status='approved', approved_role='owner', reviewed_by='operator'
         WHERE id='claim-conflict' AND status='pending' AND revision=3;
      `,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }));
    const conflictState = execFileSync("sqlite3", [database], {
      input: `
        SELECT status || ':' || revision FROM institution_claims WHERE id='claim-conflict';
        SELECT status FROM institution_memberships
         WHERE institution_id='inst-conflict' AND user_id='revoked-user';
      `,
      encoding: "utf8",
    }).trim().split("\n");
    assert.deepEqual(conflictState, ["pending:3", "revoked"]);

    execFileSync("sqlite3", [database], {
      input: `
        UPDATE institution_claims
           SET status='approved', approved_role='owner', reviewed_by='stale-operator'
         WHERE id='claim-conflict' AND status='pending' AND revision=2;
      `,
      encoding: "utf8",
    });
    const staleClaim = execFileSync("sqlite3", [database], {
      input: "SELECT status || ':' || revision FROM institution_claims WHERE id='claim-conflict';",
      encoding: "utf8",
    }).trim();
    assert.equal(staleClaim, "pending:3");

    execFileSync("sqlite3", [database], {
      input: Array.from({ length: 5 }, (_, index) => `
        INSERT INTO institutions(id, name) VALUES('limit-inst-${index}', '대기기관 ${index}');
        INSERT INTO institution_claims(
          id, institution_id, user_id, institution_name, contact_name, contact_email, contact_phone, truthful
        ) VALUES(
          'limit-claim-${index}', 'limit-inst-${index}', 'limited-user', '대기기관 ${index}',
          '담당자', 'limit${index}@example.com', '02-0000-0000', 1
        );
      `).join("\n"),
      encoding: "utf8",
    });
    execFileSync("sqlite3", [database], {
      input: "INSERT INTO institutions(id, name) VALUES('limit-inst-5', '초과기관');",
      encoding: "utf8",
    });
    assert.throws(() => execFileSync("sqlite3", [database], {
      input: `
        INSERT INTO institution_claims(
          id, institution_id, user_id, institution_name, contact_name, contact_email, contact_phone, truthful
        ) VALUES(
          'limit-claim-5', 'limit-inst-5', 'limited-user', '초과기관',
          '담당자', 'limit5@example.com', '02-0000-0000', 1
        );
      `,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }));
    const pendingLimit = execFileSync("sqlite3", [database], {
      input: "SELECT COUNT(*) FROM institution_claims WHERE user_id='limited-user' AND status='pending';",
      encoding: "utf8",
    }).trim();
    assert.equal(pendingLimit, "5");

    execFileSync("sqlite3", [database], {
      input: `
        INSERT INTO institutions(id, name, status) VALUES('inst-revision', '동시성기관', 'draft');
        INSERT INTO institution_profiles(institution_id, display_name, summary)
          VALUES('inst-revision', '동시성기관', '이전 내용');
        UPDATE institutions SET status='published' WHERE id='inst-revision';
      `,
      encoding: "utf8",
    });
    assert.throws(() => execFileSync("sqlite3", [database], {
      input: `.bail on
BEGIN;
UPDATE institutions
   SET content_revision = CASE WHEN content_revision=2 THEN content_revision+1 ELSE 0 END,
       status='draft'
 WHERE id='inst-revision';
UPDATE institution_profiles SET summary='덮어쓴 내용' WHERE institution_id='inst-revision';
COMMIT;
`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }));
    const staleWriteState = execFileSync("sqlite3", [database], {
      input: `
        SELECT content_revision || ':' || status FROM institutions WHERE id='inst-revision';
        SELECT summary FROM institution_profiles WHERE institution_id='inst-revision';
      `,
      encoding: "utf8",
    }).trim().split("\n");
    assert.deepEqual(staleWriteState, ["1:published", "이전 내용"]);

    execFileSync("sqlite3", [database], {
      input: `
        BEGIN;
        UPDATE institutions
           SET content_revision = CASE WHEN content_revision=1 THEN content_revision+1 ELSE 0 END,
               status='draft'
         WHERE id='inst-revision';
        UPDATE institution_profiles SET summary='새 내용' WHERE institution_id='inst-revision';
        COMMIT;
      `,
      encoding: "utf8",
    });
    const successfulWriteState = execFileSync("sqlite3", [database], {
      input: `
        SELECT content_revision || ':' || status FROM institutions WHERE id='inst-revision';
        SELECT summary FROM institution_profiles WHERE institution_id='inst-revision';
      `,
      encoding: "utf8",
    }).trim().split("\n");
    assert.deepEqual(successfulWriteState, ["2:draft", "새 내용"]);

    execFileSync("sqlite3", [database], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO institutions(id, name) VALUES('inst-audit', '감사기관');
        INSERT INTO pilot_agreements(
          institution_id, status, agreement_version, accepted_by, accepted_at,
          contact_role, notes, free_pilot_confirmed, no_payment_confirmed,
          content_authority_confirmed, no_billing_commitment
        ) VALUES(
          'inst-audit', 'accepted', 'pilot-v1', 'actor-A', '2026-11-18 01:00:00',
          '센터장', 'A 수락', 1, 1, 1, 1
        );
        UPDATE pilot_agreements
           SET status='withdrawn', withdrawn_by='actor-B', withdrawn_at='2026-11-18 02:00:00'
         WHERE institution_id='inst-audit';
        UPDATE pilot_agreements
           SET status='accepted', agreement_version='pilot-v2',
               accepted_by='actor-C', accepted_at='2026-11-18 03:00:00',
               withdrawn_by=NULL, withdrawn_at=NULL,
               contact_role='대표', notes='C 재수락'
         WHERE institution_id='inst-audit';
      `,
      encoding: "utf8",
    });
    const auditEvents = execFileSync("sqlite3", [database], {
      input: `
        SELECT event_type || ':' || actor_user_id || ':' || agreement_version || ':' ||
               occurred_at || ':' || contact_role || ':' || notes || ':' ||
               free_pilot_confirmed || no_payment_confirmed ||
               content_authority_confirmed || no_billing_commitment
          FROM pilot_agreement_events
         WHERE institution_id='inst-audit'
         ORDER BY id;
      `,
      encoding: "utf8",
    }).trim().split("\n");
    assert.deepEqual(auditEvents, [
      "accepted:actor-A:pilot-v1:2026-11-18 01:00:00:센터장:A 수락:1111",
      "withdrawn:actor-B:pilot-v1:2026-11-18 02:00:00:센터장:A 수락:1111",
      "reaccepted:actor-C:pilot-v2:2026-11-18 03:00:00:대표:C 재수락:1111",
    ]);

    execFileSync("sqlite3", [database], {
      input: `
        INSERT INTO institutions(id, name) VALUES('inst-same-version', '동일버전기관');
        INSERT INTO pilot_agreements(
          institution_id, status, agreement_version, accepted_by, accepted_at,
          contact_role, notes, free_pilot_confirmed, no_payment_confirmed,
          content_authority_confirmed, no_billing_commitment
        ) VALUES(
          'inst-same-version', 'accepted', 'pilot-v1', 'actor-A', '2026-11-18 05:00:00',
          '센터장', '동일 조건', 1, 1, 1, 1
        );
        UPDATE pilot_agreements
           SET status='accepted', agreement_version='pilot-v1',
               accepted_by='actor-C', accepted_at='2026-11-18 06:00:00'
         WHERE institution_id='inst-same-version';
      `,
      encoding: "utf8",
    });
    const sameVersionEvents = execFileSync("sqlite3", [database], {
      input: `
        SELECT event_type || ':' || actor_user_id || ':' || agreement_version
          FROM pilot_agreement_events
         WHERE institution_id='inst-same-version'
         ORDER BY id;
      `,
      encoding: "utf8",
    }).trim().split("\n");
    assert.deepEqual(sameVersionEvents, [
      "accepted:actor-A:pilot-v1",
      "accepted:actor-C:pilot-v1",
    ]);

    assert.throws(() => execFileSync("sqlite3", [database], {
      input: "UPDATE pilot_agreement_events SET notes='변조' WHERE institution_id='inst-audit';",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }));
    assert.throws(() => execFileSync("sqlite3", [database], {
      input: "DELETE FROM pilot_agreement_events WHERE institution_id='inst-audit';",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }));

    execFileSync("sqlite3", [database], {
      input: `
        UPDATE pilot_agreements
           SET agreement_version='pilot-v3', accepted_by='actor-D',
               accepted_at='2026-11-18 04:00:00', notes='차기 버전'
         WHERE institution_id='inst-audit';
      `,
      encoding: "utf8",
    });
    const versionEvent = execFileSync("sqlite3", [database], {
      input: `
        SELECT event_type || ':' || actor_user_id || ':' || agreement_version
          FROM pilot_agreement_events
         WHERE institution_id='inst-audit'
         ORDER BY id DESC LIMIT 1;
      `,
      encoding: "utf8",
    }).trim();
    assert.equal(versionEvent, "version_changed:actor-D:pilot-v3");

    execFileSync("sqlite3", [database], {
      input: `
        PRAGMA foreign_keys = ON;
        DELETE FROM institutions WHERE id='inst-audit';
      `,
      encoding: "utf8",
    });
    const deletedAuditCount = execFileSync("sqlite3", [database], {
      input: "SELECT COUNT(*) FROM pilot_agreement_events WHERE institution_id='inst-audit';",
      encoding: "utf8",
    }).trim();
    assert.equal(deletedAuditCount, "0");

    const triggerCount = Number(execFileSync("sqlite3", [database], {
      input: "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger';",
      encoding: "utf8",
    }).trim());
    assert.ok(triggerCount >= 20);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("운영자 승인 SQL은 검토 revision을 요구하고 단일 원자 UPDATE만 생성한다", () => {
  const scriptUrl = new URL("../scripts/approve-claim.mjs", import.meta.url);
  const script = readFileSync(scriptUrl, "utf8");
  const output = execFileSync(process.execPath, [
    scriptUrl.pathname,
    "--claim", "claim-1",
    "--reviewer", "operator-1",
    "--role", "owner",
    "--expected-revision", "7",
  ], { encoding: "utf8" });
  assert.match(output, /UPDATE institution_claims/);
  assert.match(output, /status = 'pending'/);
  assert.match(output, /revision = 7/);
  assert.match(output, /RETURNING id/);
  assert.doesNotMatch(output, /INSERT INTO institution_memberships/);
  assert.equal((output.match(/;/g) || []).length, 1);
  assert.match(script, /--expected-revision/);
  assert.doesNotMatch(script, /ON CONFLICT/);

  const missingRevision = spawnSync(process.execPath, [
    scriptUrl.pathname,
    "--claim", "claim-1",
    "--reviewer", "operator-1",
  ], { encoding: "utf8" });
  assert.notEqual(missingRevision.status, 0);
  assert.match(missingRevision.stderr, /expected-revision/);
});

/** SOFTM-HOMECARE-PILOT END */
