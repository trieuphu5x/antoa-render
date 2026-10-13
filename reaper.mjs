// reaper.mjs — DỌN R2 + DB theo retention (Boss chốt 09-14). Chạy 2 lần/ngày (reaper.yml), mỗi lần vài giây.
//  MỐC 1 — Video ĐÃ ĐĂNG ≥3 ngày  → xoá FILE R2 (nền tảng đã giữ bản riêng), NULL media_url; GIỮ record để xem/thống kê.
//  MỐC 2 — Content > 15 ngày (từ TẠO) → xoá FILE R2 (nếu còn) + XOÁ RECORD + render_jobs. Kể cả draft chưa đăng.
//  MỐC 3 — Thư mục uploads/ (Boss duyệt 10-13), 2 luật riêng vì thư mục chứa 2 loại file:
//     (a) NGUYÊN LIỆU  uploads/<tenant>/<file>   = ảnh/video user tải từ máy để dựng video → xoá sau 1 NGÀY
//         (giữ lại nếu bài dùng nó CHƯA đăng — còn "dựng lại/thay clip" được; bài quá 15 ngày bị MỐC 2 xoá thì nguyên liệu đi theo).
//     (b) THÀNH PHẨM   uploads/<contentId>.<ext> = video "Tải lên nội dung" kéo từ Drive (sheet.yml) → như video tự dựng:
//         ĐĂNG +3 ngày HOẶC TẠO +15 ngày; bài không còn trong DB (đã xoá/huỷ lịch) → xoá khi file quá 1 ngày.
//     UPLOADS_DRY_RUN=1 → CHỈ liệt kê file sẽ xoá, không xoá (dùng khi chạy tay để soát trước).
// R2 xoá qua aws-cli (S3 API — KHÔNG cần binding/thẻ CF, chỉ cần access key). DB đọc Turso.
// Thiếu secret (TURSO/R2) → bỏ qua êm (Boss chưa thêm) để lịch không báo lỗi.
import { createClient } from '@libsql/client';
import { execFileSync } from 'node:child_process';

const { TURSO_URL, TURSO_TOKEN, R2_BUCKET, R2_ENDPOINT } = process.env;
if (!TURSO_URL || !TURSO_TOKEN) { console.log('⏭  Thiếu TURSO_URL/TURSO_TOKEN → bỏ qua reaper (Boss chưa thêm secret vào antoa-render).'); process.exit(0); }
if (!R2_BUCKET || !R2_ENDPOINT) { console.log('⏭  Thiếu R2_BUCKET/R2_ENDPOINT → bỏ qua reaper.'); process.exit(0); }

const url = TURSO_URL.startsWith('libsql://') ? 'https://' + TURSO_URL.slice('libsql://'.length) : TURSO_URL;   // Turso: ép https (bài học Chots)
const db = createClient({ url, authToken: TURSO_TOKEN });
const now = Math.floor(Date.now() / 1000), D = 86400;

// Xoá 1 object R2 renders/<id>.mp4 (idempotent: không có / lỗi → bỏ qua).
const rmR2 = (id) => {
  try { execFileSync('aws', ['s3', 'rm', `s3://${R2_BUCKET}/renders/${id}.mp4`, '--endpoint-url', R2_ENDPOINT, '--region', 'auto'], { stdio: 'pipe' }); return true; }
  catch (e) { return false; }
};

// ===== MỐC 1: đã đăng ≥3 ngày (và chưa tới mốc 15 ngày — mốc 15 xoá hẳn) → xoá FILE, giữ record =====
const posted = (await db.execute({
  sql: `SELECT id FROM content_items WHERE posted_at IS NOT NULL AND posted_at <= ? AND media_url IS NOT NULL AND media_url != '' AND created_at > ?`,
  args: [now - 3 * D, now - 15 * D],
})).rows;
let file3 = 0;
for (const r of posted) { if (rmR2(r.id)) file3++; await db.execute({ sql: `UPDATE content_items SET media_url=NULL WHERE id=?`, args: [r.id] }).catch(() => {}); }
console.log(`🗑  MỐC 3 NGÀY (đã đăng): xoá ${file3}/${posted.length} file R2 (giữ record).`);

// ===== MỐC 2: quá 15 ngày từ lúc tạo → xoá FILE (nếu còn) + RECORD + render_jobs =====
const old = (await db.execute({ sql: `SELECT id, media_url FROM content_items WHERE created_at <= ?`, args: [now - 15 * D] })).rows;
let file15 = 0;
for (const r of old) { if (r.media_url) { if (rmR2(r.id)) file15++; } }
if (old.length) {
  const ids = old.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {   // batch 100 tránh SQL quá dài
    const chunk = ids.slice(i, i + 100), ph = chunk.map(() => '?').join(',');
    await db.execute({ sql: `DELETE FROM render_jobs WHERE content_id IN (${ph})`, args: chunk }).catch(() => {});
    await db.execute({ sql: `DELETE FROM content_items WHERE id IN (${ph})`, args: chunk });
  }
}
console.log(`🗑  MỐC 15 NGÀY (xoá hết): xoá ${file15} file R2 còn sót + ${old.length} record.`);

// ===== MỐC 3: thư mục uploads/ — chạy SAU mốc 1+2 để đọc trạng thái DB mới nhất. Lỗi ở đây không làm hỏng phần trên. =====
try {
  const DRY = /^(1|true)$/i.test(process.env.UPLOADS_DRY_RUN || '');
  const aws = (args) => execFileSync('aws', [...args, '--endpoint-url', R2_ENDPOINT, '--region', 'auto'], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }).toString();
  const raw = aws(['s3api', 'list-objects-v2', '--bucket', R2_BUCKET, '--prefix', 'uploads/', '--output', 'json', '--query', 'Contents[].{Key:Key,LastModified:LastModified,Size:Size}']).trim();
  const objs = (raw && raw !== 'null' ? JSON.parse(raw) : []).filter((o) => o && o.Key && !o.Key.endsWith('/'));
  const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
  const ageOf = (o) => now - Math.floor(Date.parse(o.LastModified) / 1000);

  // (a) nguyên liệu còn được bài CHƯA đăng tham chiếu (video_clips / media_ids) → giữ để dựng lại.
  const inUse = new Set();
  const refs = (await db.execute({ sql: `SELECT video_clips, media_ids FROM content_items WHERE status != 'posted' AND (video_clips LIKE '%/uploads/%' OR media_ids LIKE '%/uploads/%')`, args: [] })).rows;
  for (const r of refs) for (const t of [r.video_clips, r.media_ids]) for (const m of String(t || '').matchAll(/uploads\/[^"'\\\s?#]+/g)) { let k = m[0]; try { k = decodeURIComponent(k); } catch (e) {} inUse.add(k); }

  // (b) thành phẩm: tra bài theo id = tên file.
  const fin = objs.filter((o) => o.Key.split('/').length === 2);
  const idOf = (key) => { const f = key.slice('uploads/'.length), d = f.lastIndexOf('.'); return d > 0 ? f.slice(0, d) : f; };
  const byId = new Map(), ids = [...new Set(fin.map((o) => idOf(o.Key)))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100), ph = chunk.map(() => '?').join(',');
    for (const r of (await db.execute({ sql: `SELECT id, status, posted_at, created_at FROM content_items WHERE id IN (${ph})`, args: chunk })).rows) byId.set(r.id, r);
  }

  const kill = [];   // { o, why }
  let keepA = 0, keepB = 0;
  for (const o of objs) {
    const age = ageOf(o);
    if (!Number.isFinite(age)) continue;                       // không đọc được ngày → không đụng
    if (o.Key.split('/').length === 2) {                       // (b) thành phẩm
      const it = byId.get(idOf(o.Key));
      if (!it) { if (age >= D) kill.push({ o, why: 'thành phẩm — bài không còn trong DB' }); else keepB++; }
      else if (it.posted_at && Number(it.posted_at) <= now - 3 * D) kill.push({ o, why: 'thành phẩm — đã đăng quá 3 ngày' });
      else if (Number(it.created_at) <= now - 15 * D) kill.push({ o, why: 'thành phẩm — tạo quá 15 ngày' });
      else keepB++;
    } else {                                                   // (a) nguyên liệu
      if (age >= D && !inUse.has(o.Key)) kill.push({ o, why: 'nguyên liệu — quá 1 ngày' }); else keepA++;
    }
  }

  const total = objs.reduce((a, o) => a + Number(o.Size || 0), 0), freed = kill.reduce((a, k) => a + Number(k.o.Size || 0), 0);
  console.log(`📦 uploads/: ${objs.length} file · ${mb(total)} | giữ ${keepA} nguyên liệu + ${keepB} thành phẩm | ${DRY ? 'SẼ xoá (chạy thử, CHƯA xoá)' : 'xoá'} ${kill.length} file · ${mb(freed)}`);
  const CAP = 500; let done = 0;                               // chặn 1 lần chạy quá dài; còn lại để lần sau
  for (const k of kill.slice(0, CAP)) {
    if (DRY) { console.log(`   · ${k.o.Key} (${mb(Number(k.o.Size || 0))}, ${Math.floor(ageOf(k.o) / 3600)}h) — ${k.why}`); continue; }
    try { aws(['s3', 'rm', `s3://${R2_BUCKET}/${k.o.Key}`]); done++; } catch (e) { console.log(`   ⚠ không xoá được ${k.o.Key}`); }
  }
  if (!DRY) console.log(`🗑  MỐC uploads/: đã xoá ${done}/${kill.length} file${kill.length > CAP ? ` (còn ${kill.length - CAP} để lần sau)` : ''}.`);
} catch (e) { console.log('⚠ Bỏ qua dọn uploads/ (lỗi liệt kê R2 hoặc đọc DB):', String(e.stderr || e.message || e).slice(0, 300)); }

console.log(`✓ reaper xong lúc ${new Date().toISOString()}.`);
