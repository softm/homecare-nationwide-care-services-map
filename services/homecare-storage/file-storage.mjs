/** SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 회원·기관 권한은 기존 API에 두고 비공개 파일 저장소만 교체 */
const SETTINGS = {
  DOCUMENTS: { bucket: 'SUPABASE_DOCUMENTS_BUCKET', maxBytes: 10 * 1024 * 1024, types: ['application/pdf', 'image/jpeg', 'image/png'] },
  PHOTOS: { bucket: 'SUPABASE_PHOTOS_BUCKET', maxBytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] },
};

export class StorageError extends Error {
  constructor(code = 'storage_unavailable', message = '파일 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', status = 503) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.status = status;
  }
}

function objectPath(key) {
  if (typeof key !== 'string' || key.length > 1024 || key.split('/').some(part =>
    !part || part === '.' || part === '..' || !/^[A-Za-z0-9_.:-]+$/.test(part))) {
    throw new StorageError('storage_invalid_key', '파일 경로를 확인해 주세요.', 400);
  }
  return key.split('/').map(encodeURIComponent).join('/');
}

async function limitedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  try {
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) return null;
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function isMissingObject(response, detail) {
  return [400, 404].includes(response.status) && (
    detail?.code === 'NoSuchKey' ||
    (String(detail?.statusCode) === '404' && detail?.message === 'Object not found')
  );
}

export function createSupabaseStorage({ url, secret, bucket, uploadsEnabled = false, maxBytes, types }, fetcher = globalThis.fetch) {
  // HTTPS 공식 프로젝트 주소만 허용하고 리디렉션을 따르지 않아 비밀키의 다른 서버 전송을 차단합니다.
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(url || '') ||
      !/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(secret || '') ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '') ||
      !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Array.isArray(types) || !types.length) {
    throw new StorageError('storage_not_configured', '파일 저장소 연결을 준비 중입니다.');
  }
  const base = `${url.replace(/\/$/, '')}/storage/v1`;
  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('apikey', secret);
    try {
      return await fetcher(`${base}${path}`, {
        ...options, headers, redirect: 'error', signal: AbortSignal.timeout(30000),
      });
    } catch {
      // 공급자 오류 원문에는 파일 경로·키가 포함될 수 있어 응답과 로그에 전달하지 않습니다.
      throw new StorageError();
    }
  }
  async function verifyPrivateBucket() {
    const response = await request(`/bucket/${bucket}`);
    const info = await limitedJson(response);
    if (!response.ok || info?.id !== bucket || info.public !== false ||
        !Number.isSafeInteger(Number(info.file_size_limit)) || Number(info.file_size_limit) <= 0 ||
        Number(info.file_size_limit) > maxBytes || !Array.isArray(info.allowed_mime_types) ||
        !info.allowed_mime_types.length || info.allowed_mime_types.some(type => !types.includes(type))) {
      throw new StorageError('storage_configuration_required', '파일 저장소의 비공개·업로드 제한 설정 확인이 필요합니다.');
    }
    return { bucket: info.id, private: true, maxBytes: Number(info.file_size_limit), types: info.allowed_mime_types };
  }
  return {
    verifyPrivateBucket,
    async put(key, bytes, options = {}) {
      const path = objectPath(key);
      if (!uploadsEnabled) throw new StorageError('uploads_paused', '파일 보관 설정을 준비 중입니다. 업로드는 준비 완료 후 이용할 수 있습니다.');
      const type = options.httpMetadata?.contentType;
      const size = bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes) ? bytes.byteLength : 0;
      if (!size || size > maxBytes || !types.includes(type)) throw new StorageError('invalid_file', '첨부파일 형식과 크기를 확인해 주세요.', 400);
      const limits = await verifyPrivateBucket();
      if (size > limits.maxBytes || !limits.types.includes(type)) throw new StorageError('invalid_file', '첨부파일 형식과 크기를 확인해 주세요.', 400);
      const headers = { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'x-upsert': 'false' };
      if (options.customMetadata) {
        const metadata = new TextEncoder().encode(JSON.stringify(options.customMetadata));
        if (metadata.length > 2048) throw new StorageError('invalid_file', '파일 부가정보가 너무 큽니다.', 400);
        headers['x-metadata'] = btoa(String.fromCharCode(...metadata));
      }
      const response = await request(`/object/${bucket}/${path}`, { method: 'POST', headers, body: bytes });
      const result = await limitedJson(response);
      if (response.status === 409) throw new StorageError('storage_conflict', '같은 경로의 파일이 이미 있습니다. 다시 첨부해 주세요.', 409);
      if (!response.ok || result?.Key !== `${bucket}/${key}`) throw new StorageError();
    },
    async get(key) {
      const response = await request(`/object/authenticated/${bucket}/${objectPath(key)}`);
      if (!response.ok) {
        const detail = await limitedJson(response);
        if (isMissingObject(response, detail)) return null;
        throw new StorageError();
      }
      return { body: response.body, httpEtag: response.headers.get('ETag') || undefined };
    },
    async delete(key) {
      objectPath(key);
      const response = await request(`/object/${bucket}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [key] }),
      });
      const result = await limitedJson(response);
      // 정확한 파일 키만 삭제하고 실패는 호출자에게 전달해 기존 D1 재시도 큐를 보존합니다.
      if (!response.ok || !Array.isArray(result)) throw new StorageError();
    },
  };
}

export function fileStorage(env, binding) {
  const settings = SETTINGS[binding];
  if (!settings) throw new StorageError('storage_not_configured', '파일 저장소 연결을 준비 중입니다.');
  if (env.FILE_STORAGE_PROVIDER === 'supabase') {
    return createSupabaseStorage({
      url: env.SUPABASE_URL, secret: env.SUPABASE_SECRET_KEY, bucket: env[settings.bucket],
      uploadsEnabled: env.FILE_UPLOADS_ENABLED === 'true', maxBytes: settings.maxBytes, types: settings.types,
    });
  }
  // 기존 로컬 R2 에뮬레이터·테스트를 유지하되 Supabase 설정 실패 시 R2로 우회하지 않습니다.
  if ((!env.FILE_STORAGE_PROVIDER || env.FILE_STORAGE_PROVIDER === 'binding') && env[binding]) return env[binding];
  throw new StorageError('storage_not_configured', '파일 저장소 연결을 준비 중입니다.');
}
/** SOFTM-SUPABASE-STORAGE END */
