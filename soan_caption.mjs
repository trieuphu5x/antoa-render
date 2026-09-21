// Sinh caption bằng CLAUDE (có VISION nếu có ảnh) — chạy trên GitHub Actions.
// Vì Anthropic CHẶN request Claude phát từ Cloudflare Workers (403), caption/vision chạy ở runner (Mỹ) như soạn cảnh.
// Tải ảnh (ảnh đã làm nét R2 hoặc Drive) → base64 → gửi Claude nhìn ảnh → caption bám ảnh + chủ đề.
import fs from 'node:fs';

const TOPIC        = (process.env.TOPIC || '').trim();
const DRAFT        = (process.env.DRAFT || '').trim();   // có DRAFT = chế độ BIÊN TẬP (cải thiện bản người dùng dán/đã sinh)
const IMAGE_URL    = (process.env.IMAGE_URL || '').trim();
const DRIVE_ID     = (process.env.DRIVE_ID || '').trim();
const BRAND_NAME   = (process.env.BRAND_NAME || '').trim();
const BRAND_KW     = (process.env.BRAND_KW || '').trim();
const BRAND_PERSONA= (process.env.BRAND_PERSONA || '').trim();
const CHANNEL      = (process.env.CHANNEL || 'SAB').trim();
const PLATFORM     = (process.env.PLATFORM || 'social').trim();
const TYPE         = process.env.TYPE === 'video' ? 'video' : 'ảnh';
const KIND         = (process.env.KIND || 'caption').trim() === 'script' ? 'script' : 'caption';   // 'script' = sinh KỊCH BẢN LỜI ĐỌC video (dài đúng thời lượng, KHÔNG hashtag)
const WORDS        = Math.max(0, Number(process.env.WORDS) || 0);        // số từ đích cho kịch bản
const TARGET_SEC   = Math.max(0, Number(process.env.TARGET_SEC) || 0);   // thời lượng đích (giây)
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
const isImg = TYPE !== 'video';   // Content Ảnh → xuất 3 khối Hook/Caption/Hashtag; video → giữ freeform (dòng đầu = tiêu đề)
const brandBlock = BRAND_NAME
  ? `\nThương hiệu: ${BRAND_NAME}.${BRAND_KW ? ` Từ khoá chính (bám sát): ${BRAND_KW}.` : ''}${BRAND_PERSONA ? ` Giọng thương hiệu: ${BRAND_PERSONA}.` : ''}`
  : '';
// ĐỘ DÀI = giới hạn CỨNG (LLM hay vượt nếu để mờ) — nói dứt khoát + đặt nổi bật.
const lenLine = `ĐỘ DÀI phần Caption (GIỚI HẠN CỨNG): ${LEN_MIN}–${LEN_MAX} ký tự, KHÔNG tính hashtag. TUYỆT ĐỐI KHÔNG vượt ${LEN_MAX} ký tự — thà ngắn gọn, súc tích, chạm; KHÔNG lan man kéo dài.`;
// BÁM ẢNH MỀM (Boss chốt): ảnh cảm xúc/minh hoạ → KHÔNG ép mô tả ảnh, tránh ẩn dụ gượng (vd biến người đọc thành cái cây/lá).
const imgLineGen = img ? (isImg
  ? 'ẢNH đính kèm chỉ để tham khảo KHÔNG KHÍ. CHỈ nhắc/mô tả ảnh nếu nó THỰC SỰ khớp chủ đề; nếu ảnh chỉ là minh hoạ/nền cảm xúc thì ĐỪNG mô tả ảnh, ĐỪNG dựng ẩn dụ gượng ép từ ảnh.'
  : 'ẢNH đính kèm = bối cảnh THẬT (chủ thể, hành động, cảm xúc). Dùng chi tiết trong ảnh làm minh hoạ sống động.') : '';
const imgLineEdit = img ? (isImg
  ? 'ẢNH đính kèm chỉ tham khảo không khí — KHÔNG ép mô tả ảnh nếu không khớp chủ đề.'
  : 'ẢNH đính kèm = bối cảnh THẬT — bám sát khi biên tập.') : '';
const formatImg = `ĐỊNH DẠNG ĐẦU RA (BẮT BUỘC) — trả về ĐÚNG 3 khối, MỖI NHÃN nằm đầu một dòng riêng (giữ nguyên chữ nhãn), KHÔNG thêm gì khác:
Hook: <1 câu tiêu đề/hook đắt, dừng-lướt — KHÔNG hashtag; KHÔNG chép lại nguyên "chủ đề/gợi ý" của người dùng, hãy viết thành 1 câu hay>

Caption: <thân bài mạch lạc, xuống dòng cho thoáng, dẫn tới 1 CTA MỀM ở cuối — ${LEN_MIN}–${LEN_MAX} ký tự>

Hashtag: <4-6 hashtag ĐA DẠNG rút từ CHÍNH Ý & CẢM XÚC của bài (mỗi hashtag một khía cạnh khác nhau: chủ đề, insight, cảm xúc, hành động) — KHÔNG lặp đi lặp lại 1 từ khoá, KHÔNG nhồi tên/từ khoá kênh; TỐI ĐA 1 hashtag thương hiệu>`;
const formatVid = `CẤU TRÚC: Dòng 1 = TIÊU ĐỀ/hook đắt, dừng-lướt (KHÔNG hashtag, KHÔNG chữ "Caption"). Thân bài mạch lạc, xuống dòng thoáng, dẫn tới 1 CTA MỀM. Cuối: 4-6 hashtag ĐA DẠNG theo Ý & CẢM XÚC của bài (mỗi cái một khía cạnh, KHÔNG lặp 1 từ khoá, tối đa 1 hashtag thương hiệu).`;
const QUALITY = `CHẤT LƯỢNG (bắt buộc):
- Áp dụng 1-2 CÔNG THỨC copywriting phù hợp: AIDA (Chú ý→Thích thú→Khao khát→Hành động) · PAS (Vấn đề→Khoáy sâu→Giải pháp) · Hook–Story–CTA · BAB (Trước→Sau→Cầu nối).
- CHIỀU SÂU: có 1 insight/góc nhìn thật, chạm đúng nỗi đau hoặc khát khao của người đọc; tránh câu sáo rỗng, chung chung, "AI giọng".
- Chính tả CHUẨN tiếng Việt (vd "lạc lõng" không phải "lạc lõi"; ưu tiên "điều gì" thay "cái gì").

${lenLine}

${isImg ? formatImg : formatVid}

THUẦN VĂN BẢN tiếng Việt tự nhiên — TUYỆT ĐỐI KHÔNG markdown (không **, không gạch đầu dòng)${isImg ? '; giữ nguyên 3 nhãn Hook:/Caption:/Hashtag:' : ' (không # ở tiêu đề)'}. ${SAFETY}`;

const promptText = DRAFT
  ? `Bạn là BIÊN TẬP VIÊN copywriting bậc thầy tiếng Việt. BIÊN TẬP LẠI caption ${TYPE} dưới đây cho HAY HƠN cho kênh "${CHANNEL}" (${PLATFORM}).${brandBlock}
${imgLineEdit}${TOPIC ? `\nĐịnh hướng chủ đề (bám sát): "${TOPIC}".` : ''}
GIỮ NGUYÊN ý chính, thông điệp & thông tin của người dùng — KHÔNG đổi nội dung cốt lõi, KHÔNG bịa thêm số liệu/thông tin mới. Chỉ NÂNG CHẤT: hook đắt hơn, mạch lạc hơn, chạm cảm xúc/insight thật, bỏ câu sáo rỗng "giọng AI".

NỘI DUNG GỐC CẦN BIÊN TẬP:
"""
${DRAFT}
"""

${QUALITY}`
  : `Bạn là COPYWRITER social bậc thầy tiếng Việt. Viết 1 caption ${TYPE} cho kênh "${CHANNEL}" (${PLATFORM}).${brandBlock}
${imgLineGen}
Ý ĐỒ NGƯỜI DÙNG (chủ đề/góc — GỢI Ý ĐỊNH HƯỚNG, KHÔNG dùng làm tiêu đề): "${TOPIC || '(tự đề xuất theo ảnh)'}".
KẾT HỢP: lấy ${img && !isImg ? 'HÌNH ẢNH THẬT + ' : ''}Ý ĐỒ NGƯỜI DÙNG làm CỐT LÕI thông điệp — nội dung phải đúng điều người dùng muốn truyền tải, tuyệt đối không lạc đề.

${QUALITY}`;

// ===== KỊCH BẢN LỜI ĐỌC (video): dài ĐÚNG thời lượng, KHÔNG hashtag/nhãn/hook-tiêu-đề — chỉ lời để đọc =====
// Calib từ số THẬT (Boss test): 984 ký-tự-cả-cách ≈ 807 ký-tự-KHÔNG-cách → 60s ⇒ ~13.3 ký tự/giây (không tính dấu cách).
const CHARS = TARGET_SEC ? Math.round(TARGET_SEC / 60 * 800) : (WORDS ? WORDS * 5 : 800);   // số ký tự (KHÔNG tính dấu cách) đích
const SEC_EST = TARGET_SEC || Math.round(CHARS / 800 * 60);
const scriptPrompt = DRAFT
  ? `Bạn là biên kịch video ngắn tiếng Việt. BIÊN TẬP LẠI KỊCH BẢN LỜI ĐỌC (voiceover) dưới đây cho cuốn hơn, GIỮ ý chính.${brandBlock}${TOPIC ? `\nĐịnh hướng chủ đề: "${TOPIC}".` : ''}
ĐỘ DÀI (QUAN TRỌNG): khoảng ${CHARS} ký tự (KHÔNG tính dấu cách), tương đương video ~${SEC_EST} giây — viết ĐẦY ĐỦ tới độ dài này, KHÔNG cắt ngắn, KHÔNG dừng sớm (thiếu là video bị ngắn).
CHỈ LỜI ĐỌC thuần (văn nói tự nhiên). TUYỆT ĐỐI KHÔNG hashtag, KHÔNG nhãn/tiêu đề ("Hook:", "Kịch bản:"…), KHÔNG markdown, KHÔNG ghi chú sản xuất/[nhạc]/tên cảnh. Mỗi ý 1 câu, xuống dòng giữa các câu.
KỊCH BẢN GỐC:
"""
${DRAFT}
"""
${SAFETY}`
  : `Bạn là biên kịch video ngắn tiếng Việt. Viết KỊCH BẢN LỜI ĐỌC (voiceover) cho video về chủ đề: "${TOPIC}".${brandBlock}
ĐỘ DÀI (QUAN TRỌNG): khoảng ${CHARS} ký tự (KHÔNG tính dấu cách), tương đương video ~${SEC_EST} giây — BÁM SÁT, viết ĐẦY ĐỦ tới độ dài này, KHÔNG dừng sớm/cụt (thiếu là video bị ngắn), cũng đừng lố quá.
YÊU CẦU:
- CHỈ là LỜI ĐỌC thuần (văn nói tự nhiên, cuốn, có cảm xúc) để người dẫn đọc trực tiếp.
- Câu 1 = HOOK giữ chân; thân triển khai mạch lạc bám chủ đề; kết bằng 1 CTA mềm.
- Mỗi ý 1 CÂU NGẮN, xuống dòng giữa các câu (để tách cảnh video).
- TUYỆT ĐỐI KHÔNG hashtag (#...), KHÔNG tiêu đề/nhãn, KHÔNG markdown, KHÔNG ghi chú sản xuất/tên cảnh/[âm nhạc].
Chỉ in nội dung LỜI ĐỌC. ${SAFETY}`;
const usePrompt = KIND === 'script' ? scriptPrompt : promptText;
const useImg = KIND === 'script' ? null : img;   // kịch bản video không cần vision

const content = [];
if (useImg) content.push({ type: 'image', source: { type: 'base64', media_type: useImg.mt, data: useImg.b64 } });
content.push({ type: 'text', text: usePrompt });

if (!KEY) { console.error('❌ Thiếu CLAUDE_API_KEY secret trên render-backend'); process.exit(1); }
const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: KIND === 'script' ? Math.min(7000, Math.round(CHARS * 4) + 1000) : (isImg ? Math.min(1300, Math.round(LEN_MAX * 2.2) + 340) : 1200), messages: [{ role: 'user', content }] }),
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
// KỊCH BẢN LỜI ĐỌC: dọn triệt để hashtag + nhãn/tiêu đề nếu AI lỡ thêm (kịch bản chỉ là lời đọc).
if (KIND === 'script') caption = caption
  .replace(/#[\p{L}0-9_]+/gu, '')                                                  // bỏ mọi hashtag
  .replace(/^\s*(hook|caption|hashtag|kịch bản|tiêu đề|lời đọc|voiceover)\s*[:：].*$/gim, '')   // bỏ dòng nhãn
  .replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
if (!caption) { console.error('❌ Nội dung rỗng sau khi dọn'); process.exit(1); }
fs.writeFileSync('caption_out.txt', caption);
console.log('✅ ' + (KIND === 'script' ? `Kịch bản ~${caption.split(/\s+/).length} từ` : 'Caption') + ' (' + (DRAFT ? 'biên tập' : (img && KIND !== 'script' ? 'có nhìn ảnh' : 'theo chủ đề')) + '):', caption.slice(0, 90).replace(/\n/g, ' '));
