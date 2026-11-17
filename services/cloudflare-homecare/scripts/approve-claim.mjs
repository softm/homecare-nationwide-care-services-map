/** SOFTM-HOMECARE-PILOT START 날짜:20261118 : 검토자가 승인한 신청만 기관 관리 권한으로 전환 */

function readArgument(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const claimId = String(readArgument("--claim") || "").trim();
const reviewerId = String(readArgument("--reviewer") || "").trim();
const role = String(readArgument("--role") || "owner").trim();
const expectedRevisionText = String(readArgument("--expected-revision") || "").trim();
const expectedRevision = Number(expectedRevisionText);

if (!/^[A-Za-z0-9_-]{1,80}$/.test(claimId)) {
  process.stderr.write("--claim에 신청 식별자를 입력해 주세요.\n");
  process.exitCode = 1;
} else if (!reviewerId || reviewerId.length > 200) {
  process.stderr.write("--reviewer에 검토자 식별자를 입력해 주세요.\n");
  process.exitCode = 1;
} else if (!['owner', 'editor', 'viewer'].includes(role)) {
  process.stderr.write("--role은 owner, editor, viewer 중 하나여야 합니다.\n");
  process.exitCode = 1;
} else if (!/^[1-9]\d{0,9}$/.test(expectedRevisionText) || !Number.isSafeInteger(expectedRevision)) {
  process.stderr.write("--expected-revision에 검토한 신청 revision을 입력해 주세요.\n");
  process.exitCode = 1;
} else {
  process.stdout.write([
    "-- 검토한 revision과 일치하는 pending 신청만 승인합니다. D1 트리거가 멤버십 생성을 같은 문장 안에서 원자적으로 처리합니다.",
    `UPDATE institution_claims SET status = 'approved', approved_role = ${sql(role)}, reviewed_by = ${sql(reviewerId)}, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ${sql(claimId)} AND status = 'pending' AND revision = ${expectedRevision} RETURNING id, institution_id, user_id, status, revision, approved_role, reviewed_by, reviewed_at;`,
    "",
  ].join("\n"));
}

/** SOFTM-HOMECARE-PILOT END */
