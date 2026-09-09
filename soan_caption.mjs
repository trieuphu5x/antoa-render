// Sinh caption bằng CLAUDE (có VISION nếu có ảnh) — chạy trên GitHub Actions.
// Vì Anthropic CHẶN request Claude phát từ Cloudflare Workers (403), caption/vision chạy ở runner (Mỹ) như soạn cảnh.
// Tải ảnh (ảnh đã làm nét R2 hoặc Drive) → base64 → gửi Claude nhìn ảnh → caption bám ảnh + chủ đề.
import fs from 'node:fs';

const TOPIC        = (process.env.TOPIC || '').trim();
const IMAGE_URL    = (process.env.IMAGE_URL || '').trim();
const DRIVE_ID     = (process.env.DRIVE_ID || '').trim();
const BRAND_NAME   = (process.env.BRAND_NAME || '').trim();
const BRAND_KW     = (process.env.BRAND_KW || '').trim();
const BRAND_PERSONA= (process.env.BRAND_PERSONA || '').trim();
const CHANNEL      = (process.env.CHANNEL || 'SAB').trim();
const PLATFORM     = (process.env.PLATFORM || 'social').trim();
const TYPE         = process.env.TYPE === 'video' ? 'video' : 'ảnh';
const LEN_MIN      = Math.max(40, Number(process.env.LEN_MIN) || 200);
const LEN_MAX      = Math.max(LEN_MIN + 40, Number(process.env.LEN_MAX) || 350);
const KEY          = (process.env.CLAUDE_API_KEY || '').trim();
const MODEL        = (process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001').trim();

const SAFETY = 'Tuyệt đối KHÔNG hứa thu nhập cụ thể, KHÔNG comment-bait ("comment X nhận Y"), KHÔNG thổi phồng, KHÔNG ký tự < >. CTA mềm.';

async function fetchImageB64() {
  const cands = [];
  if (IMAGE_URL) cands.push(IMAGE_URL);
  if (DRIVE_ID) { cands.push(`https://drive.google.com/uc?export=download&id=${DRIVE_ID}`); cands.push(`https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1024`); }
  for (const u of cands) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (ANTOA caption)' } });
      if (!r.ok) continue;
      const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (/text\/html/i.test(ct)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 500) continue;
      const mt = /^image\//.test(ct) ? ct : 'image/jpeg';
      console.log('  📥 Lấy ảnh cho vision OK:', u, buf.length, 'bytes');
      return { b64: buf.toString('base64'), mt };
    } catch (e) { console.log('  ⚠️ nguồn ảnh lỗi:', u, String(e)); }
  }
  return null;
}

const img = await fetchImageB64();
const brandBlock = BRAND_NAME
  ? `\nThương hiệu: ${BRAND_NAME}.${BRAND_KW ? ` Từ khoá chính (bám sát): ${BRAND_KW}.` : ''}${BRAND_PERSONA ? ` Giọng thương hiệu: ${BRAND_PERSONA}.` : ''}`
  : '';
const promptText = `Bạn là COPYWRITER social bậc thầy tiếng Việt. Viết 1 caption ${TYPE} cho kênh "${CHANNEL}" (${PLATFORM}).${brandBlock}
${img ? 'ẢNH đính kèm = bối cảnh THẬT (chủ thể, hành động, cảm xúc, không gian). Dùng chi tiết trong ảnh làm minh hoạ sống động.' : ''}
Ý ĐỒ NGƯỜI DÙNG (chủ đề/góc — GỢI Ý ĐỊNH HƯỚNG, bám sát): "${TOPIC || '(tự đề xuất theo ảnh)'}".
KẾT HỢP: lấy ${img ? 'HÌNH ẢNH THẬT + ' : ''}Ý ĐỒ NGƯỜI DÙNG làm CỐT LÕI thông điệp — nội dung phải đúng điều người dùng muốn truyền tải, tuyệt đối không lạc đề.

CHẤT LƯỢNG (bắt buộc):
- Áp dụng 1-2 CÔNG THỨC copywriting phù hợp: AIDA (Chú ý→Thích thú→Khao khát→Hành động) · PAS (Vấn đề→Khoáy sâu→Giải pháp) · Hook–Story–CTA · BAB (Trước→Sau→Cầu nối).
- CHIỀU SÂU: có 1 insight/góc nhìn thật, chạm đúng nỗi đau hoặc khát khao của người đọc; tránh câu sáo rỗng, chung chung, "AI giọng".
- Dòng 1 = TIÊU ĐỀ/hook đắt, dừng-lướt (KHÔNG hashtag, KHÔNG chữ "Caption"). Thân bài mạch lạc, xuống dòng thoáng, dẫn tới 1 CTA MỀM tự nhiên.
- Cuối: 4-6 hashtag (ưu tiên từ khoá chính).

ĐỘ DÀI: khoảng ${LEN_MIN}–${LEN_MAX} ký tự (không tính hashtag) — viết đủ sâu trong khoảng này, không lan man cũng không cụt lủn.
THUẦN VĂN BẢN tiếng Việt tự nhiên — TUYỆT ĐỐI KHÔNG markdown (không #, không **, không gạch đầu dòng). ${SAFETY}`;

const content = [];
if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mt, data: img.b64 } });
content.push({ type: 'text', text: promptText });

if (!KEY) { console.error('❌ Thiếu CLAUDE_API_KEY secret trên render-backend'); process.exit(1); }
const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: 'user', content }] }),
});
const j = await r.json();
if (!r.ok) { console.error('❌ Claude lỗi', r.status, JSON.stringify(j?.error || j).slice(0, 220)); process.exit(1); }
let caption = (j?.content || []).map((b) => b.text || '').join('').trim();
if (!caption) { console.error('❌ Caption rỗng'); process.exit(1); }
// Dọn markdown còn sót (Claude đôi khi thêm '# ' ở tiêu đề / '**') — GIỮ hashtag (#Tag không có dấu cách).
caption = caption
  .replace(/^#{1,6}[ \t]+/gm, '')   // '# Tiêu đề' → 'Tiêu đề' (heading có dấu cách; hashtag #Tag không dính)
  .replace(/\*\*/g, '')             // bỏ ** đậm
  .replace(/^[ \t]*[-*][ \t]+/gm, '')   // bỏ gạch đầu dòng '- ' / '* '
  .trim();
fs.writeFileSync('caption_out.txt', caption);
console.log('✅ Caption (' + (img ? 'có nhìn ảnh' : 'theo chủ đề') + '):', caption.slice(0, 90).replace(/\n/g, ' '));
