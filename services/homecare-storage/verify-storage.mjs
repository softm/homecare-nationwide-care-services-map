/** SOFTM-SUPABASE-VERIFY START 날짜:20261121 : 실제 자료를 쓰지 않고 비공개 파일 왕복·익명 거부·삭제를 검증 */
import { createSupabaseStorage } from './file-storage.mjs';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI1sAAAAASUVORK5CYII='), ch => ch.charCodeAt(0));
function samplePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(content.length);
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = content.length;
  content += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(content);
}
const checksum = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');

export async function verifyStorage({ url, secret }) {
  const results = [];
  const cases = [
    { bucket: 'homecare-photos', maxBytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'], type: 'image/png', extension: 'png', bytes: PNG },
    { bucket: 'homecare-documents', maxBytes: 10 * 1024 * 1024, types: ['application/pdf', 'image/jpeg', 'image/png'], type: 'application/pdf', extension: 'pdf', bytes: samplePdf() },
  ];
  for (const spec of cases) {
    const key = `verification/${crypto.randomUUID()}.${spec.extension}`;
    const storage = createSupabaseStorage({ ...spec, url, secret, uploadsEnabled: true });
    const result = { bucket: spec.bucket, key, private: false, roundTrip: false, anonymousDenied: false, deleted: false };
    let attempted = false;
    try {
      const limits = await storage.verifyPrivateBucket();
      result.private = limits.private;
      attempted = true;
      await storage.put(key, spec.bytes, { httpMetadata: { contentType: spec.type } });
      const object = await storage.get(key);
      if (!object) throw Error('round_trip_failed');
      const actual = await new Response(object.body).arrayBuffer();
      result.roundTrip = await checksum(actual) === await checksum(spec.bytes);
      for (const path of ['public', 'authenticated']) {
        const response = await fetch(`${url}/storage/v1/object/${path}/${spec.bucket}/${key}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
        const denied = [400, 401, 403, 404].includes(response.status);
        await response.body?.cancel();
        if (!denied) throw Error('anonymous_access_not_denied');
      }
      result.anonymousDenied = true;
    } catch (error) {
      // 도구·로그로 넘기는 결과에는 자격증명과 공급자 오류 원문을 포함하지 않습니다.
      result.error = error?.name === 'StorageError' ? error.code : 'verification_failed';
    } finally {
      if (attempted) {
        try { await storage.delete(key); result.deleted = await storage.get(key) === null; }
        catch { result.cleanupError = 'cleanup_failed'; }
      }
    }
    result.ok = result.private && result.roundTrip && result.anonymousDenied && result.deleted && !result.error;
    results.push(result);
  }
  return { ok: results.every(result => result.ok), results };
}
/** SOFTM-SUPABASE-VERIFY END */
