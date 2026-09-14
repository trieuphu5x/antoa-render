// reaper.mjs — DỌN R2 + DB theo retention (Boss chốt 09-14). Chạy 2 lần/ngày (reaper.yml), mỗi lần vài giây.
//  MỐC 1 — Video ĐÃ ĐĂNG ≥3 ngày  → xoá FILE R2 (nền tảng đã giữ bản riêng), NULL media_url; GIỮ record để xem/thống kê.
//  MỐC 2 — Content > 15 ngày (từ TẠO) → xoá FILE R2 (nếu còn) + XOÁ RECORD + render_jobs. Kể cả draft chưa đăng.
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
console.log(`✓ reaper xong lúc ${new Date().toISOString()}.`);
