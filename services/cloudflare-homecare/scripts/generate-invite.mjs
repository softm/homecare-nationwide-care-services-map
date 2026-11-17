import { createHash, randomBytes, randomUUID } from "node:crypto";

/** SOFTM-HOMECARE-PILOT START 날짜:20261118 : 초대 원문은 한 번만 전달하고 D1에는 해시만 저장 */

function readArgument(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const institutionId = String(readArgument("--institution") || "").trim();
const institutionName = String(readArgument("--name") || "").trim();
const role = String(readArgument("--role") || "owner").trim();
const expiresDays = Number(readArgument("--expires-days") || 14);
const jsonOnly = process.argv.includes("--json");

if (!/^[A-Za-z0-9._:-]{1,80}$/.test(institutionId)) {
  fail("--institution에 1~80자의 기관 식별자를 입력해 주세요.");
} else if (!institutionName || institutionName.length > 160) {
  fail("--name에 160자 이내의 기관명을 입력해 주세요.");
} else if (!['owner', 'editor', 'viewer'].includes(role)) {
  fail("--role은 owner, editor, viewer 중 하나여야 합니다.");
} else if (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 365) {
  fail("--expires-days는 1~365 사이의 정수여야 합니다.");
} else {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const inviteId = randomUUID();
  const expiresAt = new Date(Date.now() + expiresDays * 86400000).toISOString();
  const commandSql = [
    `INSERT INTO institutions (id, name, status) VALUES (${sql(institutionId)}, ${sql(institutionName)}, 'draft') ON CONFLICT(id) DO NOTHING;`,
    `INSERT INTO institution_invites (id, institution_id, token_hash, role, expires_at) VALUES (${sql(inviteId)}, ${sql(institutionId)}, ${sql(tokenHash)}, ${sql(role)}, ${sql(expiresAt)});`,
  ].join("\n");
  const result = { inviteId, institutionId, institutionName, role, expiresAt, token, tokenHash, sql: commandSql };
  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write([
      "초대 코드는 아래 한 번만 기관 담당자에게 안전하게 전달하세요.",
      token,
      "",
      "D1에 적용할 SQL",
      commandSql,
      "",
    ].join("\n"));
  }
}

/** SOFTM-HOMECARE-PILOT END */
