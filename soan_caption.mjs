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
const promptText = `Viết caption ${TYPE} tiếng Việt cho kênh "${CHANNEL}" (${PLATFORM}).${brandBlock}
${img ? 'NHÌN KỸ ẢNH đính kèm và viết caption BÁM SÁT nội dung thật trong ảnh (chủ thể, hành động, bối cảnh, cảm xúc).' : ''}
Chủ đề/góc (định hướng): ${TOPIC || '(không có)'}.
CẤU TRÚC: Dòng 1 = TIÊU ĐỀ ngắn, hook mạnh (KHÔNG hashtag, KHÔNG chữ "Caption"). Sau đó vài dòng caption${img ? ' bám ảnh' : ''}, xuống dòng thoáng. Cuối: 4-6 hashtag (ưu tiên từ khoá chính).
Viết THUẦN VĂN BẢN tiếng Việt tự nhiên, có chiều sâu — TUYỆT ĐỐI KHÔNG markdown (không #, không **, không gạch đầu dòng). ${SAFETY}`;

const content = [];
if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mt, data: img.b64 } });
content.push({ type: 'text', text: promptText });

if (!KEY) { console.error('❌ Thiếu CLAUDE_API_KEY secret trên render-backend'); process.exit(1); }
const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content }] }),
});
const j = await r.json();
if (!r.ok) { console.error('❌ Claude lỗi', r.status, JSON.stringify(j?.error || j).slice(0, 220)); process.exit(1); }
const caption = (j?.content || []).map((b) => b.text || '').join('').trim();
if (!caption) { console.error('❌ Caption rỗng'); process.exit(1); }
fs.writeFileSync('caption_out.txt', caption);
console.log('✅ Caption (' + (img ? 'có nhìn ảnh' : 'theo chủ đề') + '):', caption.slice(0, 90).replace(/\n/g, ' '));
